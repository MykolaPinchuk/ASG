import { spawn } from "node:child_process";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import net from "node:net";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import { HttpAgentController } from "../controllers/httpAgentController.js";
import { MixBot } from "../controllers/mixBot.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { fetchOpenAiCompatModelIds, getProviderAllowlist, loadOssModelsConfig } from "../llm/models.js";
import type { Controller } from "../controllers/controller.js";
import type { PlayerId, Replay } from "../game/types.js";

type ProviderName = "nanogpt" | "chutes" | "openrouter" | string;
type Opponent = "mix" | "greedy";

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

function parseModelsArg(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeysFile(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    const eq = line.indexOf("=");
    const splitAt = idx >= 0 ? idx : eq >= 0 ? eq : -1;
    if (splitAt < 0) continue;
    const k = line.slice(0, splitAt).trim().toLowerCase();
    const v = line.slice(splitAt + 1).trim();
    if (!k || !v) continue;
    out.set(k, v);
  }
  return out;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
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

function summarizeAgentTelemetry(latencies: number[]) {
  const sorted = latencies.slice().sort((a, b) => a - b);
  const avg = sorted.length ? Math.round(sorted.reduce((s, x) => s + x, 0) / sorted.length) : null;
  const p50 = percentile(sorted, 0.5);
  const p95 = percentile(sorted, 0.95);
  return { avg, p50, p95 };
}

type Row = {
  provider: string;
  model: string;
  opponent: Opponent;
  seeds: number[];
  plannedGames: number;
  games: number;
  replayPaths?: string[];
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgProviderErrorTurns: number;
  avgAgentCaptures: number;
  captureRate: number;
  error?: string;
};

function formatPct(x: number): string {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(0)}%`;
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function evalOneModel(params: {
  providerName: ProviderName;
  keysFile: string;
  baseUrl?: string;
  model: string;
  modelsConfig: string;
  scenario: Awaited<ReturnType<typeof loadScenarioFromFile>>;
  adjacency: ReturnType<typeof createAdjacency>;
  seeds: number[];
  opponent: Opponent;
  mixGreedyProb: number;
  agentTimeoutMs: number;
  openAiTimeoutMs: string;
  maxTokens: string;
  temperature: string;
  useTools: boolean;
  toolsMode?: string;
  thinkHint?: string;
  reasoningEffort?: string;
  promptMode?: string;
  stopAfterErrors?: number;
  saveReplays: boolean;
  replaysDir: string;
  liveOut?: string;
  agentLogDir?: string;
  serverLogDir?: string;
}) {
  // Clone per model so any early-stop turn-cap tweaks do not leak across models.
  const scenario = structuredClone(params.scenario);
  const adjacency = params.adjacency;
  const ctx = { scenario, adjacency };

  const port = await pickFreePort();
  const agentUrl = `http://127.0.0.1:${port}`;

  const tsxBin = path.resolve("node_modules/.bin/tsx");
  const serverArgs = [
    "src/cli/agentServer.ts",
    "--provider",
    "openai_compat",
    "--provider-name",
    String(params.providerName),
    "--keys-file",
    params.keysFile,
    "--model",
    params.model,
    "--port",
    String(port),
    "--models-config",
    params.modelsConfig,
    "--timeout-ms",
    params.openAiTimeoutMs,
    "--max-tokens",
    params.maxTokens,
    "--temperature",
    params.temperature,
    "--use-tools",
    params.useTools ? "true" : "false",
    "--fallback",
    "pass",
  ];
  if (params.promptMode) serverArgs.push("--prompt-mode", params.promptMode);
  if (params.toolsMode) serverArgs.push("--tools-mode", params.toolsMode);
  if (params.thinkHint) serverArgs.push("--think-hint", params.thinkHint);
  if (params.reasoningEffort) serverArgs.push("--reasoning-effort", params.reasoningEffort);
  if (params.baseUrl) serverArgs.push("--base-url", params.baseUrl);
  if (params.serverLogDir) serverArgs.push("--log-dir", params.serverLogDir);

  const child = spawn(tsxBin, serverArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ASG_MODELS_CONFIG: params.modelsConfig },
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

  let wins = 0;
  let draws = 0;
  let losses = 0;
  let providerErrorTurnsTotal = 0;
  let agentCapturesTotal = 0;
  let trialsWithAnyCapture = 0;
  const replayPaths: string[] = [];
  let gamesPlayed = 0;

  try {
    await waitForServer(`${agentUrl}/act`, 8000);

    for (let i = 0; i < params.seeds.length; i++) {
      const seed = params.seeds[i]!;
      const matchId = `${scenario.id}_seed${seed}_agent_vs_${params.opponent}_${slugify(String(params.providerName))}_${encodeURIComponent(
        params.model,
      )}_trial${i}`;

      const agentController = new HttpAgentController({
        id: "agent",
        url: agentUrl,
        apiVersion: "0.1",
        matchId,
        scenarioId: scenario.id,
        player: "P1",
        actionBudget: scenario.settings.actionBudget,
        timeoutMs: params.agentTimeoutMs,
        maxResponseBytes: 256_000,
        logDir: params.agentLogDir,
      });

      let errorTurns = 0;
      let earlyStopTriggered = false;
      const stopAfterErrors = Number.isInteger(params.stopAfterErrors) ? Math.max(0, params.stopAfterErrors!) : 0;
      const agentWrapped: Controller = {
        id: agentController.id,
        decide: async (obs) => {
          const out = await agentController.decide(obs);
          const last = agentController.telemetry[agentController.telemetry.length - 1];
          const isAgentErr = !!last?.error || (out.rationaleText ?? "").startsWith("agent error:");
          const isProviderErr = (out.rationaleText ?? "").includes("server: openai_compat error");
          if (isAgentErr || isProviderErr) errorTurns += 1;

          if (!earlyStopTriggered && stopAfterErrors > 0 && errorTurns >= stopAfterErrors) {
            // Force a draw on the next applyTurn by tightening the turn cap to the upcoming ply.
            const nextPly = obs.ply + 1;
            scenario.settings.turnCapPlies = Math.min(scenario.settings.turnCapPlies ?? nextPly, nextPly);
            earlyStopTriggered = true;
          }

          return out;
        },
      };

      const opponentController: Controller =
        params.opponent === "mix"
          ? new MixBot({
              seed: seed + 202,
              adjacency,
              scenario,
              greedyProb: params.mixGreedyProb,
            })
          : new GreedyBot({ adjacency, scenario });

      const controllers: Record<PlayerId, Controller> = { P1: agentWrapped, P2: opponentController };
      const replay = await runMatch({ ctx, controllers, seed });
      gamesPlayed += 1;

      // Attach metadata so the viewer shows model/provider and MixBot params.
      const agentInfo = agentController.agentInfo;
      const baseAgentMeta: NonNullable<Replay["players"]>["P1"] = {
        kind: "agent",
        agentUrl,
        ...(agentInfo ?? {}),
      } as any;
      replay.players = {
        P1: baseAgentMeta,
        P2: params.opponent === "mix" ? { kind: "mix", greedyProb: params.mixGreedyProb } : { kind: "greedy" },
      };

      if (params.saveReplays) {
        const providerSlug = slugify(String(params.providerName));
        const modelSlug = slugify(params.model);
        const outFile = path.join(
          params.replaysDir,
          `${scenario.id}_seed${seed}_agent_vs_${params.opponent}_${providerSlug}_${modelSlug}.json`,
        );
        await mkdir(path.dirname(outFile), { recursive: true });
        await writeFile(outFile, JSON.stringify(replay, null, 2), "utf8");
        replayPaths.push(outFile);
        console.log(`saved replay: ${outFile}`);
      }

      const plies = replay.turns.length;
      const agentTurns = replay.turns.filter((t) => t.player === "P1");
      const agentPassTurns = agentTurns.filter(
        (t) => (t.actions ?? []).length === 0 || (t.actions ?? []).every((a) => a.type === "pass"),
      ).length;
      const providerErrors = agentTurns.filter((t) => (t.rationaleText ?? "").includes("server: openai_compat error")).length;
      providerErrorTurnsTotal += providerErrors;

      const telemetryAll = agentController.telemetry.map((t) => t.latencyMs);
      const tStatsAll = summarizeAgentTelemetry(telemetryAll);
      const telemetryOk = agentController.telemetry.filter((t) => !t.error).map((t) => t.latencyMs);
      const tStatsOk = summarizeAgentTelemetry(telemetryOk);
      const agentErrors = agentController.telemetry.filter((t) => !!t.error).length;
      const resultShort = replay.result.type === "draw" ? "draw" : replay.result.winner === "P1" ? "win" : "loss";
      const gameRow = {
        provider: String(params.providerName),
        model: params.model,
        opponent: params.opponent,
        seed,
        result: resultShort,
        plies,
        agentTurns: agentTurns.length,
        agentPassTurns,
        agentErrorTurns: agentErrors,
        providerErrorTurns: providerErrors,
        stopAfterErrors: stopAfterErrors || undefined,
        errorTurns: stopAfterErrors ? errorTurns : undefined,
        earlyStop: stopAfterErrors ? earlyStopTriggered : undefined,
        avgLatencyMs: tStatsAll.avg,
        p95LatencyMs: tStatsAll.p95,
        avgLatencyOkMs: tStatsOk.avg,
        p95LatencyOkMs: tStatsOk.p95,
      };
      console.log(
        `game: provider=${String(params.providerName)} model=${params.model} opponent=${params.opponent} seed=${seed} result=${resultShort} plies=${plies} agentTurns=${agentTurns.length} passTurns=${agentPassTurns} errors=${agentErrors} providerErrors=${providerErrors} avgLatencyMs=${tStatsAll.avg ?? "—"} p95LatencyMs=${tStatsAll.p95 ?? "—"} avgLatencyOkMs=${tStatsOk.avg ?? "—"} p95LatencyOkMs=${tStatsOk.p95 ?? "—"}${
          stopAfterErrors ? ` errorTurns=${errorTurns}${earlyStopTriggered ? " earlyStop=true" : ""}` : ""
        }`,
      );
      if (params.liveOut) {
        const dir = path.dirname(params.liveOut);
        if (dir && dir !== ".") await mkdir(dir, { recursive: true });
        await writeFile(params.liveOut, JSON.stringify(gameRow) + "\n", { flag: "a" });
      }

      let agentCaptures = 0;
      for (const t of agentTurns) {
        for (const e of t.events ?? []) {
          if (e.type === "capture" && (e as any).newOwner === "P1") agentCaptures += 1;
        }
      }
      agentCapturesTotal += agentCaptures;
      if (agentCaptures > 0) trialsWithAnyCapture += 1;

      if (replay.result.type === "draw") draws += 1;
      else if (replay.result.winner === "P1") wins += 1;
      else losses += 1;

      if (stopAfterErrors > 0 && errorTurns >= stopAfterErrors) {
        console.log(`stopAfterErrors=${stopAfterErrors} hit (errorTurns=${errorTurns}); moving to next model`);
        break;
      }
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`${err}\n--- agent server stdout ---\n${serverStdout.slice(-2000)}\n--- agent server stderr ---\n${serverStderr.slice(-2000)}`);
  } finally {
    await stopServer();
  }

  const plannedGames = params.seeds.length;
  const winRate = gamesPlayed > 0 ? wins / gamesPlayed : Number.NaN;
  return {
    provider: String(params.providerName),
    model: params.model,
    opponent: params.opponent,
    seeds: params.seeds.slice(),
    plannedGames,
    games: gamesPlayed,
    replayPaths: params.saveReplays ? replayPaths : undefined,
    wins,
    draws,
    losses,
    winRate,
    avgProviderErrorTurns: gamesPlayed > 0 ? providerErrorTurnsTotal / gamesPlayed : Number.NaN,
    avgAgentCaptures: gamesPlayed > 0 ? agentCapturesTotal / gamesPlayed : Number.NaN,
    captureRate: gamesPlayed > 0 ? trialsWithAnyCapture / gamesPlayed : Number.NaN,
  } satisfies Row;
}

async function main() {
  const args = parseArgs(process.argv);

  const unsafeAllowLong = (args.get("--unsafe-allow-long") ?? "false").toLowerCase() === "true";
  const unsafeAllowMany = (args.get("--unsafe-allow-many") ?? "false").toLowerCase() === "true";

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const keysFile = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const providerName: ProviderName = args.get("--provider-name") ?? "nanogpt";
  const baseUrl =
    args.get("--base-url") ??
    (providerName === "chutes" ? "https://llm.chutes.ai/v1" : undefined) ??
    (providerName === "openrouter" ? "https://openrouter.ai/api/v1" : undefined) ??
    (providerName === "cerebras" ? "https://api.cerebras.ai/v1" : undefined);
  const modelsConfig = args.get("--models-config") ?? process.env.ASG_MODELS_CONFIG ?? "configs/oss_baselines.json";

  const seedStart = Number.parseInt(args.get("--seed-start") ?? args.get("--seed") ?? "3", 10);
  const games = Number.parseInt(args.get("--games") ?? args.get("--trials") ?? "3", 10);
  const seedsRaw = args.get("--seeds");
  const turnCapRaw = args.get("--turn-cap-plies");
  const turnCapPlies = turnCapRaw ? Number.parseInt(turnCapRaw, 10) : 30;
  const opponentRaw = (args.get("--opponent") ?? "mix").toLowerCase();
  if (opponentRaw !== "mix" && opponentRaw !== "greedy") throw new Error("--opponent must be mix|greedy");
  const opponent = opponentRaw as Opponent;
  const mixGreedyProb = Number.parseFloat(args.get("--mix-greedy-prob") ?? "0.5");
  // Keep a small buffer over the agent server's typical upstream timeout (so we don't abort right as it responds).
  const agentTimeoutMs = Number.parseInt(args.get("--agent-timeout-ms") ?? "95000", 10);

  const openAiTimeoutMsArg = args.get("--timeout-ms");
  const maxTokens = args.get("--max-tokens") ?? "600";
  const temperature = args.get("--temperature") ?? "0";
  const useToolsDefault = providerName !== "chutes";
  const useToolsRaw = (args.get("--use-tools") ?? (useToolsDefault ? "true" : "false")).toLowerCase();
  const useTools = useToolsRaw !== "false";
  const promptMode = args.get("--prompt-mode") ?? undefined;
  const stopAfterErrorsRaw = args.get("--stop-after-errors") ?? "2";
  const stopAfterErrors = Number.parseInt(stopAfterErrorsRaw, 10);

  const saveReplaysRaw = (args.get("--save-replays") ?? "true").toLowerCase();
  let saveReplays = saveReplaysRaw !== "false";
  if (!saveReplays) {
    console.log("WARN --save-replays=false ignored (always saving replays).");
    saveReplays = true;
  }
  const replaysDirArg = args.get("--replays-dir");
  const agentLogDir = args.get("--agent-log-dir") ?? undefined;
  const serverLogDir = args.get("--server-log-dir") ?? undefined;
  const liveOut = args.get("--live-out") ?? undefined;
  const toolsMode = args.get("--tools-mode") ?? undefined;
  const thinkHint = args.get("--think-hint") ?? undefined;
  const reasoningEffort = args.get("--reasoning-effort") ?? undefined;

  const modelsRaw = args.get("--models") ?? "";
  const modelsFile = args.get("--models-file");
  const outPath = args.get("--out");

  let models: string[] = [];
  if (modelsRaw) models = parseModelsArg(modelsRaw);
  if (modelsFile) {
    const text = await readFile(modelsFile, "utf8");
    const fromFile = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("#"));
    models = models.length > 0 ? models : fromFile;
  }

  if (models.length === 0) {
    try {
      const cfg = await loadOssModelsConfig(modelsConfig);
      const { priority } = getProviderAllowlist(cfg, String(providerName));
      const picked = priority.slice(0, 3);
      if (picked.length > 0) {
        models = picked;
        console.log(`No --models provided; defaulting to baselines from ${modelsConfig}: ${models.join(",")}`);
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`WARN failed to load baselines from ${modelsConfig}: ${err.split("\n")[0]}`);
    }
  }

  if (models.length === 0) {
    throw new Error("Provide --models a,b,c or --models-file path/to/models.txt (or set --models-config to a config with provider priority baselines)");
  }
  if (!Number.isInteger(seedStart) || seedStart < 0) throw new Error("--seed-start/--seed must be an integer >= 0");
  if (!Number.isInteger(games) || games < 1 || games > 50) throw new Error("--games/--trials must be an integer in [1,50]");
  if (!Number.isInteger(turnCapPlies) || turnCapPlies < 1) throw new Error("--turn-cap-plies must be >=1");
  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");
  if (!Number.isInteger(stopAfterErrors) || stopAfterErrors < 0 || stopAfterErrors > 100) {
    throw new Error("--stop-after-errors must be an integer in [0, 100]");
  }
  if (turnCapPlies > 30 && !unsafeAllowLong) {
    throw new Error("Policy: --turn-cap-plies must be <= 30 on v0/v05 (pass --unsafe-allow-long true to override).");
  }
  if (games > 5 && !unsafeAllowMany) {
    throw new Error("Policy: --games/--trials must be <= 5 on v0/v05 (pass --unsafe-allow-many true to override).");
  }

  let seeds: number[] = [];
  if (seedsRaw) {
    seeds = seedsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10));
    if (seeds.some((s) => !Number.isInteger(s) || s < 0)) throw new Error("--seeds must be a comma-separated list of integers >=0");
  } else {
    seeds = Array.from({ length: games }, (_, i) => seedStart + i);
  }
  if (seeds.length > 5 && !unsafeAllowMany) {
    throw new Error("Policy: number of seeds/games must be <= 5 on v0/v05 (pass --unsafe-allow-many true to override).");
  }

  const scenario = await loadScenarioFromFile(scenarioPath);
  scenario.settings.turnCapPlies = turnCapPlies;
  const adjacency = createAdjacency(scenario);
  const replaysDir = replaysDirArg ?? path.join("replays", "model_evals", nowStamp());

  const rows: Row[] = [];

  const validateModelsDefault = providerName === "chutes" || providerName === "nanogpt";
  const validateModelsRaw = (args.get("--validate-models") ?? (validateModelsDefault ? "true" : "false")).toLowerCase();
  const validateModels = validateModelsRaw !== "false";
  if (validateModels) {
    try {
      const keys = parseKeysFile(await readFile(keysFile, "utf8"));
      const providerKey = keys.get(String(providerName).toLowerCase()) || undefined;
      const providerBaseUrl =
        baseUrl ??
        keys.get(`${String(providerName).toLowerCase()}_base_url`) ??
        undefined;
      if (!providerBaseUrl) throw new Error("missing baseUrl");
      const ids = await fetchOpenAiCompatModelIds({ baseUrl: providerBaseUrl, apiKey: providerKey });
      const available = new Set(ids);
      const missing = models.filter((m) => !available.has(m));
      if (missing.length > 0) {
        for (const m of missing) console.log(`SKIP model=${m} (not listed by ${providerName} /models)`);
      }
      models = models.filter((m) => available.has(m));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`WARN validate-models failed; proceeding without filtering: ${err.split("\n")[0]}`);
    }
  }

  if (models.length === 0) throw new Error("All provided models were filtered out (not present on provider).");

  for (const model of models) {
    console.log(`=== provider=${providerName} opponent=${opponent} model=${model} ===`);
    try {
      const row = await evalOneModel({
        providerName,
        keysFile,
        baseUrl,
        model,
        modelsConfig,
        scenario,
        adjacency,
        seeds,
        opponent,
        mixGreedyProb,
        agentTimeoutMs,
        openAiTimeoutMs: openAiTimeoutMsArg ?? "70000",
        maxTokens,
        temperature,
        useTools,
        toolsMode,
        thinkHint,
        reasoningEffort,
        promptMode,
        stopAfterErrors,
        saveReplays: true,
        replaysDir,
        liveOut,
        agentLogDir,
        serverLogDir,
      });
      rows.push(row);
      const nonLossRate = (row.wins + row.draws) / Math.max(1, row.games);
      console.log(
        `wins=${row.wins}/${row.games} (${formatPct(row.winRate)}) nonLoss=${formatPct(nonLossRate)} draws=${row.draws} losses=${row.losses} captureRate=${formatPct(
          row.captureRate,
        )} avgCaptures=${row.avgAgentCaptures.toFixed(2)} avgProviderErrorTurns=${row.avgProviderErrorTurns.toFixed(2)}`,
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`FAILED model=${model}: ${err.split("\n")[0]}`);
      rows.push({
        provider: String(providerName),
        model,
        opponent,
        seeds,
        plannedGames: seeds.length,
        games: 0,
        replayPaths: [],
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: Number.NaN,
        avgProviderErrorTurns: 0,
        avgAgentCaptures: 0,
        captureRate: 0,
        error: err,
      });
    }
  }

  rows.sort((a, b) => b.winRate - a.winRate || a.model.localeCompare(b.model));

  const table = [
    "| provider | opponent | model | played | planned | wins | draws | losses | win rate | non-loss rate | capture rate | avg captures | avg provider-error turns |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (r) => {
        const nonLossRate = r.games > 0 ? (r.wins + r.draws) / r.games : Number.NaN;
        return `| ${r.provider} | ${r.opponent} | ${r.model} | ${r.games} | ${r.plannedGames} | ${r.wins} | ${r.draws} | ${r.losses} | ${formatPct(r.winRate)} | ${formatPct(
          nonLossRate,
        )} | ${formatPct(r.captureRate)} | ${r.avgAgentCaptures.toFixed(2)} | ${r.avgProviderErrorTurns.toFixed(2)} |`;
      },
    ),
  ].join("\n");

  console.log("\n" + table + "\n");
  if (saveReplays) console.log(`Replays saved under: ${replaysDir}`);

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(
      outPath,
      JSON.stringify(
        {
          seeds,
          plannedGames: seeds.length,
          provider: providerName,
          opponent,
          mixGreedyProb: opponent === "mix" ? mixGreedyProb : undefined,
          useTools,
          saveReplays,
          replaysDir,
          rows,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`Wrote: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
