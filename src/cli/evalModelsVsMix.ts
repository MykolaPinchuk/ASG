import { spawn } from "node:child_process";
import path from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import net from "node:net";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import { HttpAgentController } from "../controllers/httpAgentController.js";
import { MixBot } from "../controllers/mixBot.js";
import type { Controller } from "../controllers/controller.js";
import type { PlayerId, Replay } from "../game/types.js";

type ProviderName = "nanogpt" | "chutes" | "openrouter" | string;

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 160);
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
  seeds: number[];
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
  mixGreedyProb: number;
  agentTimeoutMs: number;
  openAiTimeoutMs: string;
  maxTokens: string;
  temperature: string;
  useTools: boolean;
  promptMode?: string;
  saveReplays: boolean;
  replaysDir: string;
  liveOut?: string;
  agentLogDir?: string;
  serverLogDir?: string;
}) {
  const scenario = params.scenario;
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

  try {
    await waitForServer(`${agentUrl}/act`, 8000);

    for (let i = 0; i < params.seeds.length; i++) {
      const seed = params.seeds[i]!;
      const matchId = `${scenario.id}_seed${seed}_agent_vs_mix_${slugify(String(params.providerName))}_${encodeURIComponent(
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

      const mixController: Controller = new MixBot({
        seed: seed + 202,
        adjacency,
        scenario,
        greedyProb: params.mixGreedyProb,
      });

      const controllers: Record<PlayerId, Controller> = { P1: agentController, P2: mixController };
      const replay = await runMatch({ ctx, controllers, seed });

      // Attach metadata so the viewer shows model/provider and MixBot params.
      const agentInfo = agentController.agentInfo;
      const baseAgentMeta: NonNullable<Replay["players"]>["P1"] = {
        kind: "agent",
        agentUrl,
        ...(agentInfo ?? {}),
      } as any;
      replay.players = {
        P1: baseAgentMeta,
        P2: { kind: "mix", greedyProb: params.mixGreedyProb },
      };

      if (params.saveReplays) {
        const providerSlug = slugify(String(params.providerName));
        const modelSlug = slugify(params.model);
        const outFile = path.join(params.replaysDir, `${scenario.id}_seed${seed}_agent_vs_mix_${providerSlug}_${modelSlug}.json`);
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

      const telemetryOk = agentController.telemetry.filter((t) => !t.error).map((t) => t.latencyMs);
      const tStats = summarizeAgentTelemetry(telemetryOk);
      const agentErrors = agentController.telemetry.filter((t) => !!t.error).length;
      const resultShort = replay.result.type === "draw" ? "draw" : replay.result.winner === "P1" ? "win" : "loss";
      const gameRow = {
        provider: String(params.providerName),
        model: params.model,
        seed,
        result: resultShort,
        plies,
        agentTurns: agentTurns.length,
        agentPassTurns,
        agentErrorTurns: agentErrors,
        providerErrorTurns: providerErrors,
        avgLatencyOkMs: tStats.avg,
        p95LatencyOkMs: tStats.p95,
      };
      console.log(
        `game: provider=${String(params.providerName)} model=${params.model} seed=${seed} result=${resultShort} plies=${plies} agentTurns=${agentTurns.length} passTurns=${agentPassTurns} errors=${agentErrors} providerErrors=${providerErrors} avgLatencyOkMs=${tStats.avg ?? "—"} p95LatencyOkMs=${tStats.p95 ?? "—"}`,
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
    }
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`${err}\n--- agent server stdout ---\n${serverStdout.slice(-2000)}\n--- agent server stderr ---\n${serverStderr.slice(-2000)}`);
  } finally {
    await stopServer();
  }

  const games = Math.max(1, params.seeds.length);
  const winRate = wins / games;
  return {
    provider: String(params.providerName),
    model: params.model,
    seeds: params.seeds.slice(),
    games,
    replayPaths: params.saveReplays ? replayPaths : undefined,
    wins,
    draws,
    losses,
    winRate,
    avgProviderErrorTurns: providerErrorTurnsTotal / games,
    avgAgentCaptures: agentCapturesTotal / games,
    captureRate: trialsWithAnyCapture / games,
  } satisfies Row;
}

async function main() {
  const args = parseArgs(process.argv);

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const keysFile = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const providerName: ProviderName = args.get("--provider-name") ?? "nanogpt";
  const baseUrl = args.get("--base-url") ?? undefined;
  const modelsConfig = args.get("--models-config") ?? process.env.ASG_MODELS_CONFIG ?? "configs/oss_models.json";

  const seedStart = Number.parseInt(args.get("--seed-start") ?? args.get("--seed") ?? "3", 10);
  const games = Number.parseInt(args.get("--games") ?? args.get("--trials") ?? "3", 10);
  const seedsRaw = args.get("--seeds");
  const turnCapRaw = args.get("--turn-cap-plies");
  const turnCapPlies = turnCapRaw ? Number.parseInt(turnCapRaw, 10) : 30;
  const mixGreedyProb = Number.parseFloat(args.get("--mix-greedy-prob") ?? "0.5");
  const agentTimeoutMs = Number.parseInt(args.get("--agent-timeout-ms") ?? "60000", 10);

  const openAiTimeoutMs = args.get("--timeout-ms") ?? "60000";
  const maxTokens = args.get("--max-tokens") ?? "200";
  const temperature = args.get("--temperature") ?? "0";
  const useToolsRaw = (args.get("--use-tools") ?? "true").toLowerCase();
  const useTools = useToolsRaw !== "false";
  const promptMode = args.get("--prompt-mode") ?? undefined;

  const saveReplaysRaw = (args.get("--save-replays") ?? "true").toLowerCase();
  const saveReplays = saveReplaysRaw !== "false";
  const replaysDirArg = args.get("--replays-dir");
  const agentLogDir = args.get("--agent-log-dir") ?? undefined;
  const serverLogDir = args.get("--server-log-dir") ?? undefined;
  const liveOut = args.get("--live-out") ?? undefined;

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

  if (models.length === 0) throw new Error("Provide --models a,b,c or --models-file path/to/models.txt");
  if (!Number.isInteger(seedStart) || seedStart < 0) throw new Error("--seed-start/--seed must be an integer >= 0");
  if (!Number.isInteger(games) || games < 1 || games > 50) throw new Error("--games/--trials must be an integer in [1,50]");
  if (!Number.isInteger(turnCapPlies) || turnCapPlies < 1) throw new Error("--turn-cap-plies must be >=1");
  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");

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

  const scenario = await loadScenarioFromFile(scenarioPath);
  scenario.settings.turnCapPlies = turnCapPlies;
  const adjacency = createAdjacency(scenario);
  const replaysDir = replaysDirArg ?? path.join("replays", "model_evals", nowStamp());

  const rows: Row[] = [];
  for (const model of models) {
    console.log(`=== provider=${providerName} model=${model} ===`);
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
        mixGreedyProb,
        agentTimeoutMs,
        openAiTimeoutMs,
        maxTokens,
        temperature,
        useTools,
        promptMode,
        saveReplays,
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
        seeds,
        games: seeds.length,
        replayPaths: [],
        wins: 0,
        draws: 0,
        losses: 0,
        winRate: 0,
        avgProviderErrorTurns: 0,
        avgAgentCaptures: 0,
        captureRate: 0,
        error: err,
      });
    }
  }

  rows.sort((a, b) => b.winRate - a.winRate || a.model.localeCompare(b.model));

  const table = [
    "| provider | model | games | wins | draws | losses | win rate | non-loss rate | capture rate | avg captures | avg provider-error turns |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (r) => {
        const nonLossRate = (r.wins + r.draws) / Math.max(1, r.games);
        return `| ${r.provider} | ${r.model} | ${r.games} | ${r.wins} | ${r.draws} | ${r.losses} | ${formatPct(r.winRate)} | ${formatPct(
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
      JSON.stringify({ seeds, games: seeds.length, provider: providerName, mixGreedyProb, useTools, saveReplays, replaysDir, rows }, null, 2),
      "utf8",
    );
    console.log(`Wrote: ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
