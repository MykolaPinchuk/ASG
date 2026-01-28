import { spawn } from "node:child_process";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { RandomBot } from "../controllers/randomBot.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { MixBot } from "../controllers/mixBot.js";
import { HttpAgentController } from "../controllers/httpAgentController.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import type { Controller } from "../controllers/controller.js";
import type { PlayerId, Replay } from "../game/types.js";

type OpponentName = "random" | "greedy" | "mix";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, val);
      i += 1;
    }
  }
  return args;
}

async function pickFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        server.close();
        reject(new Error("Failed to pick a free port"));
        return;
      }
      const port = addr.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url, { method: "OPTIONS" });
      if (res.status === 204) return;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Agent server did not become ready within ${timeoutMs}ms: ${url}`);
}

function summarizeReplay(replay: Replay, agentPlayer: PlayerId) {
  const agentTurns = replay.turns.filter((t) => t.player === agentPlayer);
  const passTurns = agentTurns.filter((t) => (t.actions ?? []).length === 0 || (t.actions ?? []).every((a) => a.type === "pass")).length;
  const providerErrorTurns = agentTurns.filter((t) => (t.rationaleText ?? "").includes("server: openai_compat error")).length;
  const agentActions = agentTurns.flatMap((t) => t.actions ?? []);
  const moveActions = agentActions.filter((a) => a.type === "move").length;
  const reinforceActions = agentActions.filter((a) => a.type === "reinforce").length;
  let captureEvents = 0;
  let combatEvents = 0;
  let invalidActionEvents = 0;
  for (const t of agentTurns) {
    for (const e of t.events ?? []) {
      if (e.type === "capture") captureEvents += 1;
      else if (e.type === "combat") combatEvents += 1;
      else if (e.type === "invalid_action") invalidActionEvents += 1;
    }
  }
  return {
    plies: replay.turns.length,
    agentTurns: agentTurns.length,
    agentPassTurns: passTurns,
    providerErrorTurns,
    agentMoveActions: moveActions,
    agentReinforceActions: reinforceActions,
    agentCaptures: captureEvents,
    agentCombats: combatEvents,
    agentInvalidActions: invalidActionEvents,
    result: replay.result,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function looksLikeReasoningModelId(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.includes(":thinking") || m.includes("thinking") || m.includes("reasoning") || m.includes("deepseek-r1") || m.includes("deepseek_r1");
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.floor(clamped * (sortedAsc.length - 1));
  return sortedAsc[idx] ?? null;
}

function summarizeLatencies(latencies: number[]) {
  const sorted = latencies.slice().sort((a, b) => a - b);
  const avg = sorted.length ? Math.round(sorted.reduce((s, x) => s + x, 0) / sorted.length) : null;
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return { avg, p50, p95 };
}

async function main() {
  const args = parseArgs(process.argv);

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const start = Number.parseInt(args.get("--start") ?? "1", 10);
  const count = Number.parseInt(args.get("--count") ?? "5", 10);
  const agentSide = (args.get("--agent-side") ?? "P1") as PlayerId;
  const opponent = (args.get("--opponent") ?? "random") as OpponentName;
  const mixGreedyProb = Number.parseFloat(args.get("--mix-greedy-prob") ?? "0.5");
  const keysFile = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const providerName = args.get("--provider-name") ?? "nanogpt";
  const baseUrl = args.get("--base-url") ?? undefined; // optional; keys-file may contain it
  const providerKey = providerName.toLowerCase();
  const modelArg = args.get("--model");
  const model = modelArg ?? (providerKey === "openrouter" ? "x-ai/grok-4.1-fast" : "auto");
  const modelsConfig = args.get("--models-config") ?? process.env.ASG_MODELS_CONFIG ?? "configs/oss_baselines.json";
  // Keep a buffer over the agent server's upstream timeout (so we don't abort right as it responds).
  const agentTimeoutMs = Number.parseInt(args.get("--agent-timeout-ms") ?? "95000", 10);
  const saveReplays = args.get("--save-replays") === "true";
  const outDir = args.get("--out-dir") ?? "replays";
  const liveOut = args.get("--live-out") ?? undefined;
  const turnCapOverrideRaw = args.get("--turn-cap-plies");
  const turnCapPliesOverride = turnCapOverrideRaw
    ? Number.parseInt(turnCapOverrideRaw, 10)
    : opponent === "mix"
      ? 30
      : undefined;
  const tag = args.get("--tag") ?? `${providerName}_${model}`;
  const tagSlug = slugify(tag);

  const openAiTimeoutMs = args.get("--timeout-ms") ?? (looksLikeReasoningModelId(model) ? "80000" : "60000");
  const maxTokens = args.get("--max-tokens") ?? "600";
  const temperature = args.get("--temperature") ?? "0";
  const promptMode = args.get("--prompt-mode") ?? undefined;

  if (!Number.isInteger(start) || start < 0) throw new Error("--start must be an integer >= 0");
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error("--count must be an integer in [1, 200]");
  if (agentSide !== "P1" && agentSide !== "P2") throw new Error("--agent-side must be P1 or P2");
  if (!["random", "greedy", "mix"].includes(opponent)) throw new Error("--opponent must be random, greedy, or mix");
  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");
  if (!Number.isInteger(agentTimeoutMs) || agentTimeoutMs < 1000) throw new Error("--agent-timeout-ms must be an integer >= 1000");
  if (providerKey === "openrouter" && model === "auto") {
    throw new Error("--model auto is not supported for OpenRouter; omit --model to default to x-ai/grok-4.1-fast, or pass --model <id>");
  }
  if (turnCapPliesOverride !== undefined) {
    if (!Number.isInteger(turnCapPliesOverride) || turnCapPliesOverride < 1) throw new Error("--turn-cap-plies must be an integer >= 1");
  }

  const scenario = await loadScenarioFromFile(scenarioPath);
  if (turnCapPliesOverride !== undefined) scenario.settings.turnCapPlies = turnCapPliesOverride;
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  const port = await pickFreePort();
  const agentUrl = `http://127.0.0.1:${port}`;

  const tsxBin = path.resolve("node_modules/.bin/tsx");
  const serverArgs = [
    "src/cli/agentServer.ts",
    "--provider",
    "openai_compat",
    "--provider-name",
    providerName,
    "--keys-file",
    keysFile,
    "--model",
    model,
    "--port",
    String(port),
    "--models-config",
    modelsConfig,
    "--timeout-ms",
    openAiTimeoutMs,
    "--max-tokens",
    maxTokens,
    "--temperature",
    temperature,
  ];
  if (promptMode) serverArgs.push("--prompt-mode", promptMode);
  if (baseUrl) serverArgs.push("--base-url", baseUrl);

  const child = spawn(tsxBin, serverArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ASG_MODELS_CONFIG: modelsConfig },
  });

  let serverStdout = "";
  let serverStderr = "";
  child.stdout?.on("data", (d) => (serverStdout += d.toString("utf8")));
  child.stderr?.on("data", (d) => (serverStderr += d.toString("utf8")));

  const stopServer = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 250));
    if (child.exitCode === null) child.kill("SIGKILL");
  };

  try {
    await waitForServer(`${agentUrl}/act`, 8000);

    const stats: {
      seeds: { start: number; count: number };
      matchup: { agentSide: PlayerId; opponent: OpponentName; providerName: string; model: string; modelsConfig: string };
      results: { agentWins: number; opponentWins: number; draws: number };
      avgPlies: number;
      avgAgentPassTurns: number;
      avgProviderErrorTurns: number;
      avgAgentMoveActions: number;
      avgAgentReinforceActions: number;
      avgAgentCaptures: number;
      avgAgentCombats: number;
      avgAgentInvalidActions: number;
      sampleReplay?: string;
    } = {
      seeds: { start, count },
      matchup: { agentSide, opponent, providerName, model, modelsConfig },
      results: { agentWins: 0, opponentWins: 0, draws: 0 },
      avgPlies: 0,
      avgAgentPassTurns: 0,
      avgProviderErrorTurns: 0,
      avgAgentMoveActions: 0,
      avgAgentReinforceActions: 0,
      avgAgentCaptures: 0,
      avgAgentCombats: 0,
      avgAgentInvalidActions: 0,
    };

    let totalPlies = 0;
    let totalAgentPassTurns = 0;
    let totalProviderErrorTurns = 0;
    let totalAgentMoveActions = 0;
    let totalAgentReinforceActions = 0;
    let totalAgentCaptures = 0;
    let totalAgentCombats = 0;
    let totalAgentInvalidActions = 0;

    for (let i = 0; i < count; i++) {
      const seed = start + i;
      const matchId = `${scenario.id}_seed${seed}_agent_vs_${opponent}_${tagSlug}`;

      const agentController = new HttpAgentController({
        id: "agent",
        url: agentUrl,
        apiVersion: "0.1",
        matchId,
        scenarioId: scenario.id,
        player: agentSide,
        actionBudget: scenario.settings.actionBudget,
        timeoutMs: agentTimeoutMs,
        maxResponseBytes: 256_000,
        logDir: "runs/agent_io",
      });

      const opponentSeed = seed + (agentSide === "P1" ? 202 : 101);
      const opponentController: Controller =
        opponent === "random"
          ? new RandomBot({ seed: opponentSeed, adjacency, scenario })
          : opponent === "mix"
            ? new MixBot({ seed: opponentSeed, adjacency, scenario, greedyProb: mixGreedyProb })
            : new GreedyBot({ adjacency, scenario });

      const controllers: Record<PlayerId, Controller> =
        agentSide === "P1"
          ? { P1: agentController, P2: opponentController }
          : { P1: opponentController, P2: agentController };

      const replay = await runMatch({ ctx, controllers, seed });

      const agentInfo = agentController.agentInfo;
      const baseAgentMeta = {
        kind: "agent" as const,
        agentUrl,
        provider: providerName,
        baseUrl: baseUrl,
        model,
        modelMode: model === "auto" ? ("auto" as const) : ("explicit" as const),
      };
      replay.players = {
        P1:
          agentSide === "P1"
            ? { ...baseAgentMeta, ...(agentInfo ?? {}) }
            : opponent === "mix"
              ? { kind: "mix", greedyProb: mixGreedyProb }
              : { kind: opponent },
        P2:
          agentSide === "P2"
            ? { ...baseAgentMeta, ...(agentInfo ?? {}) }
            : opponent === "mix"
              ? { kind: "mix", greedyProb: mixGreedyProb }
              : { kind: opponent },
      };

      const summary = summarizeReplay(replay, agentSide);
      totalPlies += summary.plies;
      totalAgentPassTurns += summary.agentPassTurns;
      totalProviderErrorTurns += summary.providerErrorTurns;
      totalAgentMoveActions += summary.agentMoveActions;
      totalAgentReinforceActions += summary.agentReinforceActions;
      totalAgentCaptures += summary.agentCaptures;
      totalAgentCombats += summary.agentCombats;
      totalAgentInvalidActions += summary.agentInvalidActions;

      if (replay.result.type === "draw") stats.results.draws += 1;
      else if (replay.result.winner === agentSide) stats.results.agentWins += 1;
      else stats.results.opponentWins += 1;

      const telemetryOk = agentController.telemetry.filter((t) => !t.error).map((t) => t.latencyMs);
      const latency = summarizeLatencies(telemetryOk);
      const agentErrors = agentController.telemetry.filter((t) => !!t.error).length;

      const gameRow = {
        provider: providerName,
        model,
        opponent,
        seed,
        plies: summary.plies,
        result: replay.result.type === "draw" ? "DRAW" : `WIN_${replay.result.winner}`,
        agentPassTurns: summary.agentPassTurns,
        providerErrorTurns: summary.providerErrorTurns,
        agentErrorTurns: agentErrors,
        avgLatencyOkMs: latency.avg,
        p95LatencyOkMs: latency.p95,
      };

      console.log(
        `game: provider=${providerName} model=${model} opponent=${opponent} seed=${seed} result=${gameRow.result} plies=${summary.plies} passTurns=${summary.agentPassTurns} errors=${agentErrors} providerErrors=${summary.providerErrorTurns} avgLatencyOkMs=${latency.avg ?? "—"} p95LatencyOkMs=${latency.p95 ?? "—"}`,
      );

      if (liveOut) {
        const dir = path.dirname(liveOut);
        if (dir && dir !== ".") await mkdir(dir, { recursive: true });
        await writeFile(liveOut, JSON.stringify(gameRow) + "\n", { flag: "a" });
      }

      if (saveReplays) {
        await mkdir(outDir, { recursive: true });
        const outFile = path.join(outDir, `${scenario.id}_seed${seed}_agent_vs_${opponent}_${tagSlug}.json`);
        await writeFile(outFile, JSON.stringify(replay, null, 2), "utf8");
        if (i === 0) stats.sampleReplay = outFile;
      }
    }

    stats.avgPlies = totalPlies / count;
    stats.avgAgentPassTurns = totalAgentPassTurns / count;
    stats.avgProviderErrorTurns = totalProviderErrorTurns / count;
    stats.avgAgentMoveActions = totalAgentMoveActions / count;
    stats.avgAgentReinforceActions = totalAgentReinforceActions / count;
    stats.avgAgentCaptures = totalAgentCaptures / count;
    stats.avgAgentCombats = totalAgentCombats / count;
    stats.avgAgentInvalidActions = totalAgentInvalidActions / count;

    console.log("---");
    console.log(JSON.stringify(stats, null, 2));
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`${err}\n--- agent server stdout ---\n${serverStdout.slice(-2000)}\n--- agent server stderr ---\n${serverStderr.slice(-2000)}`);
  } finally {
    await stopServer();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
