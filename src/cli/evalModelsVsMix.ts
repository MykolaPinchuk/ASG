import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { buildOpenAiCompatPromptSnapshot } from "../providers/openaiCompat.js";
import { pacificFileStamp, pacificIsoString } from "../utils/pacificTime.js";
import { loadExperimentPolicy } from "../experiments/policy.js";
import type { Controller } from "../controllers/controller.js";
import type { PlayerId, Replay } from "../game/types.js";

type ProviderName = "nanogpt" | "chutes" | "openrouter" | string;
type Opponent = "mix" | "greedy";
type TurnErrorTag =
  | "timeout"
  | "rate_limit"
  | "provider_5xx"
  | "provider_4xx"
  | "empty_output"
  | "json_parse_error"
  | "invalid_action"
  | "fallback_used"
  | "controller_error";

type ExperimentMeta = {
  runId: string;
  experimentId: string;
  conditionId: string;
  baselineConditionId?: string;
  ablationKey?: string;
};

type GitMeta = {
  branch?: string;
  commit?: string;
  dirty?: boolean;
};

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

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseOnOff(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.toLowerCase().trim();
  if (v === "on" || v === "true" || v === "1" || v === "yes") return true;
  if (v === "off" || v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}

function toObservationFromScenario(scenario: {
  map: { nodes: Array<{ id: string; x: number; y: number; owner: string; supplyYield: number }> };
  initialState: { playerSupply: Record<PlayerId, number>; nodeForces: Record<string, Record<PlayerId, number>> };
}) {
  const nodes: Record<
    string,
    { id: string; x: number; y: number; owner: string; supplyYield: number; forces: Record<PlayerId, number> }
  > = {};
  for (const node of scenario.map.nodes) {
    const f = scenario.initialState.nodeForces[node.id] ?? { P1: 0, P2: 0 };
    nodes[node.id] = {
      id: node.id,
      x: node.x,
      y: node.y,
      owner: node.owner,
      supplyYield: node.supplyYield,
      forces: {
        P1: Number.isFinite(f.P1) ? Math.max(0, Math.floor(f.P1)) : 0,
        P2: Number.isFinite(f.P2) ? Math.max(0, Math.floor(f.P2)) : 0,
      },
    };
  }
  return {
    player: "P1" as const,
    ply: 0,
    activePlayer: "P1" as const,
    supplies: {
      P1: Number.isFinite(scenario.initialState.playerSupply.P1) ? Math.max(0, Math.floor(scenario.initialState.playerSupply.P1)) : 0,
      P2: Number.isFinite(scenario.initialState.playerSupply.P2) ? Math.max(0, Math.floor(scenario.initialState.playerSupply.P2)) : 0,
    },
    nodes,
  };
}

function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i]![j] = (dp[i - 1]![j - 1] ?? 0) + 1;
      else dp[i]![j] = Math.max(dp[i - 1]![j] ?? 0, dp[i]![j - 1] ?? 0);
    }
  }
  return dp[m]![n] ?? 0;
}

function lineDiffCount(aText: string, bText: string): number {
  const a = aText.split(/\r?\n/);
  const b = bText.split(/\r?\n/);
  const lcs = lcsLength(a, b);
  return (a.length - lcs) + (b.length - lcs);
}

function parseRationaleStyle(
  raw: string | undefined,
): "concise" | "structured10" | "structured10_exp015" {
  const mode = (raw ?? "concise").toLowerCase().trim();
  if (mode === "concise") return "concise";
  if (mode === "structured10") return "structured10";
  if (mode === "structured10_exp015" || mode === "structured10-exp015" || mode === "exp015") return "structured10_exp015";
  return "concise";
}

function runGit(args: string[]): string | undefined {
  const out = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 1500,
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (out.status !== 0) return undefined;
  const text = (out.stdout ?? "").trim();
  return text.length > 0 ? text : undefined;
}

function getGitMeta(): GitMeta {
  const commit = runGit(["rev-parse", "HEAD"]);
  const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  const status = runGit(["status", "--porcelain"]);
  return {
    branch,
    commit,
    dirty: typeof status === "string" ? status.length > 0 : undefined,
  };
}

function getTurnErrorTags(turn: Replay["turns"][number]): TurnErrorTag[] {
  const tags = new Set<TurnErrorTag>();
  const diagnostics = turn.diagnostics;
  const status = diagnostics?.upstreamStatus ?? diagnostics?.httpStatus;
  const combined = `${diagnostics?.error ?? ""} ${diagnostics?.upstreamError ?? ""} ${turn.rationaleText ?? ""}`.toLowerCase();

  const hasInvalidAction = (turn.events ?? []).some((e) => e.type === "invalid_action");
  if (hasInvalidAction) tags.add("invalid_action");
  if (diagnostics?.usedFallback) tags.add("fallback_used");
  if (status === 429 || combined.includes("rate limit") || combined.includes("rate_limit")) tags.add("rate_limit");
  if (typeof status === "number" && status >= 500) tags.add("provider_5xx");
  else if (typeof status === "number" && status >= 400) tags.add("provider_4xx");
  if (combined.includes("timeout") || combined.includes("timed out") || combined.includes("aborted") || combined.includes("aborterror")) {
    tags.add("timeout");
  }
  if (combined.includes("empty_response") || combined.includes("empty_output") || combined.includes("no message.content")) {
    tags.add("empty_output");
  }
  if (combined.includes("json") || combined.includes("unexpected token") || combined.includes("parse")) {
    tags.add("json_parse_error");
  }
  const hasControllerError = !!diagnostics?.error || !!diagnostics?.upstreamError;
  if (hasControllerError) {
    const taggedProviderError =
      tags.has("timeout") ||
      tags.has("rate_limit") ||
      tags.has("provider_5xx") ||
      tags.has("provider_4xx") ||
      tags.has("empty_output") ||
      tags.has("json_parse_error");
    if (!taggedProviderError) tags.add("controller_error");
  }

  return Array.from(tags);
}

function hasProviderErrorFromTags(tags: TurnErrorTag[]): boolean {
  return tags.some((tag) => tag !== "invalid_action" && tag !== "fallback_used");
}

async function evalOneModel(params: {
  experiment: ExperimentMeta;
  providerName: ProviderName;
  keysFile: string;
  keysName?: string;
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
  fallback?: string;
  toolsMode?: string;
  stream?: string;
  thinkHint?: string;
  reasoningEffort?: string;
  rationaleStyle?: string;
  reasoningSplit?: string;
  memory?: string;
  memoryMaxChars?: string;
  warmup?: string;
  warmupTimeoutMs?: string;
  warmupMaxTokens?: string;
  repair?: string;
  repairMaxRounds?: string;
  retryOnFailure?: string;
  retryReasoningEffort?: string;
  selectMode?: string;
  selectK?: string;
  selectCandidateTemperature?: string;
  selectUntilPly?: string;
  promptMode?: string;
  stopAfterErrors?: number;
  saveReplays: boolean;
  replaysDir: string;
  liveOut?: string;
  agentLogDir?: string;
  serverLogDir?: string;
  gameMetricsRows?: Array<Record<string, unknown>>;
  turnMetricsRows?: Array<Record<string, unknown>>;
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
    params.fallback ?? "pass",
  ];
  if (params.keysName) serverArgs.push("--keys-name", params.keysName);
  if (params.promptMode) serverArgs.push("--prompt-mode", params.promptMode);
  if (params.toolsMode) serverArgs.push("--tools-mode", params.toolsMode);
  if (params.stream) serverArgs.push("--stream", params.stream);
  if (params.thinkHint) serverArgs.push("--think-hint", params.thinkHint);
  if (params.reasoningEffort) serverArgs.push("--reasoning-effort", params.reasoningEffort);
  if (params.rationaleStyle) serverArgs.push("--rationale-style", params.rationaleStyle);
  if (params.reasoningSplit) serverArgs.push("--reasoning-split", params.reasoningSplit);
  if (params.memory) serverArgs.push("--memory", params.memory);
  if (params.memoryMaxChars) serverArgs.push("--memory-max-chars", params.memoryMaxChars);
  if (params.warmup) serverArgs.push("--warmup", params.warmup);
  if (params.warmupTimeoutMs) serverArgs.push("--warmup-timeout-ms", params.warmupTimeoutMs);
  if (params.warmupMaxTokens) serverArgs.push("--warmup-max-tokens", params.warmupMaxTokens);
  if (params.repair) serverArgs.push("--repair", params.repair);
  if (params.repairMaxRounds) serverArgs.push("--repair-max-rounds", params.repairMaxRounds);
  if (params.retryOnFailure) serverArgs.push("--retry-on-failure", params.retryOnFailure);
  if (params.retryReasoningEffort) serverArgs.push("--retry-reasoning-effort", params.retryReasoningEffort);
  if (params.selectMode) serverArgs.push("--select-mode", params.selectMode);
  if (params.selectK) serverArgs.push("--select-k", params.selectK);
  if (params.selectCandidateTemperature) serverArgs.push("--select-candidate-temperature", params.selectCandidateTemperature);
  if (params.selectUntilPly) serverArgs.push("--select-until-ply", params.selectUntilPly);
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
      const invalidActionTurns = agentTurns.filter((t) => (t.events ?? []).some((e) => e.type === "invalid_action")).length;
      const fallbackTurns = agentTurns.filter((t) => t.diagnostics?.usedFallback === true).length;
      const retryTurns = agentTurns.filter((t) => t.diagnostics?.usedRetry === true).length;
      const providerErrors = agentTurns.filter((t) => (t.rationaleText ?? "").includes("server: openai_compat error")).length;
      providerErrorTurnsTotal += providerErrors;

      const telemetryAll = agentController.telemetry.map((t) => t.latencyMs);
      const tStatsAll = summarizeAgentTelemetry(telemetryAll);
      const telemetryOk = agentController.telemetry.filter((t) => !t.error).map((t) => t.latencyMs);
      const tStatsOk = summarizeAgentTelemetry(telemetryOk);
      const agentErrors = agentController.telemetry.filter((t) => !!t.error).length;
      const resultShort = replay.result.type === "draw" ? "draw" : replay.result.winner === "P1" ? "win" : "loss";

      let agentCaptures = 0;
      let firstCapturePly: number | null = null;
      let providerErrorTurnsDerived = 0;
      for (const t of agentTurns) {
        const turnCaptures = (t.events ?? []).filter((e) => e.type === "capture" && (e as any).newOwner === "P1").length;
        if (turnCaptures > 0 && firstCapturePly === null) firstCapturePly = t.ply;
        agentCaptures += turnCaptures;
        const tags = getTurnErrorTags(t);
        if (hasProviderErrorFromTags(tags)) providerErrorTurnsDerived += 1;
      }

      const finalState = replay.turns[replay.turns.length - 1]?.stateAfter;
      const supplyYieldOwnedAtEnd = Object.values(finalState?.nodes ?? {}).reduce((sum, n) => {
        if (n.owner !== "P1") return sum;
        return sum + (Number.isFinite(n.supplyYield) ? n.supplyYield : 0);
      }, 0);

      const gameRow = {
        ...params.experiment,
        provider: String(params.providerName),
        model: params.model,
        opponent: params.opponent,
        seed,
        result: resultShort,
        plies,
        agentTurns: agentTurns.length,
        agentPassTurns,
        invalidActionTurns,
        fallbackTurns,
        retryTurns,
        agentErrorTurns: agentErrors,
        providerErrorTurns: providerErrors,
        providerErrorTurnsDerived,
        captures: agentCaptures,
        firstCapturePly,
        supplyYieldOwnedAtEnd,
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

      if (params.gameMetricsRows) {
        params.gameMetricsRows.push({
          ...params.experiment,
          provider: String(params.providerName),
          model: params.model,
          opponent: params.opponent,
          seed,
          result: resultShort,
          replayPath: replayPaths[replayPaths.length - 1],
          plies,
          agentTurns: agentTurns.length,
          passTurns: agentPassTurns,
          invalidActionTurns,
          fallbackTurns,
          retryTurns,
          agentErrorTurns: agentErrors,
          providerErrorTurns: providerErrors,
          providerErrorTurnsDerived,
          captures: agentCaptures,
          firstCapturePly,
          supplyYieldOwnedAtEnd,
          avgLatencyMs: tStatsAll.avg,
          p50LatencyMs: tStatsAll.p50,
          p95LatencyMs: tStatsAll.p95,
          avgLatencyOkMs: tStatsOk.avg,
          p50LatencyOkMs: tStatsOk.p50,
          p95LatencyOkMs: tStatsOk.p95,
          stopAfterErrors: stopAfterErrors || undefined,
          errorTurns: stopAfterErrors ? errorTurns : undefined,
          earlyStop: stopAfterErrors ? earlyStopTriggered : undefined,
        });
      }

      if (params.turnMetricsRows) {
        for (const t of agentTurns) {
          const actionTypes = (t.actions ?? []).map((a) => a.type);
          const isPassTurn = actionTypes.length === 0 || actionTypes.every((type) => type === "pass");
          const invalidActionCount = (t.events ?? []).filter((e) => e.type === "invalid_action").length;
          const captureCount = (t.events ?? []).filter((e) => e.type === "capture" && (e as any).newOwner === "P1").length;
          const tags = getTurnErrorTags(t);
          const attempts = t.diagnostics?.attempts ?? [];
          const tokenUsage = t.diagnostics?.tokenUsage;
          params.turnMetricsRows.push({
            ...params.experiment,
            provider: String(params.providerName),
            model: params.model,
            opponent: params.opponent,
            seed,
            ply: t.ply,
            actionsCount: actionTypes.length,
            actionTypes,
            isPassTurn,
            invalidActionCount,
            captureCount,
            latencyMs: t.latencyMs,
            httpStatus: t.diagnostics?.httpStatus,
            upstreamStatus: t.diagnostics?.upstreamStatus,
            usedFallback: t.diagnostics?.usedFallback ?? false,
            usedRetry: t.diagnostics?.usedRetry ?? false,
            retryFromReasoningEffort: t.diagnostics?.retry?.fromReasoningEffort,
            retryToReasoningEffort: t.diagnostics?.retry?.toReasoningEffort,
            attemptsCount: attempts.length,
            attemptErrorCount: attempts.filter((a) => !!a.error).length,
            attemptStatuses: attempts.map((a) => a.upstreamStatus).filter((x) => typeof x === "number"),
            promptTokens: tokenUsage?.promptTokens,
            completionTokens: tokenUsage?.completionTokens,
            reasoningTokens: tokenUsage?.reasoningTokens,
            totalTokens: tokenUsage?.totalTokens,
            errorTags: tags,
            hasProviderError: hasProviderErrorFromTags(tags),
          });
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
  const { policy: experimentPolicy, path: experimentPolicyPath } = await loadExperimentPolicy(process.cwd());

  const unsafeAllowLong = (args.get("--unsafe-allow-long") ?? "false").toLowerCase() === "true";
  const unsafeAllowMany = (args.get("--unsafe-allow-many") ?? "false").toLowerCase() === "true";

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const keysFile = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const keysName = args.get("--keys-name") ?? undefined;
  const providerName: ProviderName = args.get("--provider-name") ?? "nanogpt";
  const baseUrl =
    args.get("--base-url") ??
    (providerName === "chutes" ? "https://llm.chutes.ai/v1" : undefined) ??
    (providerName === "openrouter" ? "https://openrouter.ai/api/v1" : undefined) ??
    (providerName === "cerebras" ? "https://api.cerebras.ai/v1" : undefined);
  const modelsConfig = args.get("--models-config") ?? process.env.ASG_MODELS_CONFIG ?? "configs/oss_baselines.json";

  const seedStartRaw = args.get("--seed-start") ?? args.get("--seed");
  const gamesRaw = args.get("--games") ?? args.get("--trials");
  const hasExplicitSeedRange = args.has("--seed-start") || args.has("--seed") || args.has("--games") || args.has("--trials");
  const seedsRaw = args.get("--seeds");
  const seedProfileArg = args.get("--seed-profile");
  const seedProfile = seedProfileArg ?? (!seedsRaw && !hasExplicitSeedRange ? experimentPolicy.defaultSeedProfile : undefined);
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
  const fallback = args.get("--fallback") ?? undefined;
  const promptMode = args.get("--prompt-mode") ?? undefined;
  const memory = args.get("--memory") ?? undefined;
  const memoryMaxChars = args.get("--memory-max-chars") ?? undefined;
  const warmup = args.get("--warmup") ?? undefined;
  const warmupTimeoutMs = args.get("--warmup-timeout-ms") ?? undefined;
  const warmupMaxTokens = args.get("--warmup-max-tokens") ?? undefined;
  const repair = args.get("--repair") ?? undefined;
  const repairMaxRounds = args.get("--repair-max-rounds") ?? undefined;
  const retryOnFailure = args.get("--retry-on-failure") ?? undefined;
  const retryReasoningEffort = args.get("--retry-reasoning-effort") ?? undefined;
  const selectMode = args.get("--select-mode") ?? undefined;
  const selectK = args.get("--select-k") ?? undefined;
  const selectCandidateTemperature = args.get("--select-candidate-temperature") ?? undefined;
  const selectUntilPly = args.get("--select-until-ply") ?? undefined;
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
  const stream = args.get("--stream") ?? undefined;
  const thinkHint = args.get("--think-hint") ?? undefined;
  const reasoningEffort = args.get("--reasoning-effort") ?? undefined;
  const rationaleStyle = args.get("--rationale-style") ?? undefined;
  const reasoningSplit = args.get("--reasoning-split") ?? undefined;

  const modelsRaw = args.get("--models") ?? "";
  const modelsFile = args.get("--models-file");
  const outPath = args.get("--out");
  const runStartedAtMs = Date.now();
  const runStartedAt = pacificIsoString();
  const runId = pacificFileStamp();
  const experimentId = args.get("--experiment-id") ?? `exp_${runId}`;
  const conditionId = args.get("--condition-id") ?? "control";
  const baselineConditionId = args.get("--baseline-condition-id") ?? undefined;
  const ablationKey = args.get("--ablation-key") ?? undefined;
  const baselineSystemPromptFile = args.get("--baseline-system-prompt-file") ?? undefined;
  const expectedSystemPromptDiffLinesRaw = args.get("--expected-system-prompt-diff-lines");
  const expectedSystemPromptDiffLines =
    expectedSystemPromptDiffLinesRaw !== undefined ? Number.parseInt(expectedSystemPromptDiffLinesRaw, 10) : undefined;
  const hypothesis = args.get("--hypothesis") ?? undefined;
  const notes = args.get("--notes") ?? undefined;
  const experimentLogEnabled = (args.get("--experiment-log") ?? "true").toLowerCase() !== "false";
  const defaultExperimentLogDir =
    args.get("--experiment-log-dir") ?? path.join("runs", "experiment_logs", `${runId}_${slugify(String(providerName))}_${slugify(opponent)}`);
  const summaryOutPath = outPath ?? (experimentLogEnabled ? path.join(defaultExperimentLogDir, "summary.json") : undefined);
  const manifestOutPath = args.get("--manifest-out") ?? (experimentLogEnabled ? path.join(defaultExperimentLogDir, "manifest.json") : undefined);
  const gameMetricsOutPath =
    args.get("--game-metrics-out") ?? (experimentLogEnabled ? path.join(defaultExperimentLogDir, "game_metrics.jsonl") : undefined);
  const turnMetricsOutPath =
    args.get("--turn-metrics-out") ?? (experimentLogEnabled ? path.join(defaultExperimentLogDir, "turn_metrics.jsonl") : undefined);

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
  if (!Number.isInteger(turnCapPlies) || turnCapPlies < 1) throw new Error("--turn-cap-plies must be >=1");
  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");
  if (!Number.isInteger(stopAfterErrors) || stopAfterErrors < 0 || stopAfterErrors > 100) {
    throw new Error("--stop-after-errors must be an integer in [0, 100]");
  }
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,119}$/;
  if (!idPattern.test(experimentId)) {
    throw new Error("--experiment-id must match [A-Za-z0-9][A-Za-z0-9._-]{1,119}");
  }
  if (!idPattern.test(conditionId)) {
    throw new Error("--condition-id must match [A-Za-z0-9][A-Za-z0-9._-]{1,119}");
  }
  if (baselineConditionId && !idPattern.test(baselineConditionId)) {
    throw new Error("--baseline-condition-id must match [A-Za-z0-9][A-Za-z0-9._-]{1,119}");
  }
  if (ablationKey && ablationKey.length > 200) throw new Error("--ablation-key must be <= 200 chars");
  if (expectedSystemPromptDiffLinesRaw !== undefined) {
    if (!Number.isInteger(expectedSystemPromptDiffLines) || (expectedSystemPromptDiffLines ?? -1) < 0) {
      throw new Error("--expected-system-prompt-diff-lines must be an integer >= 0");
    }
    if (!baselineSystemPromptFile) {
      throw new Error("--expected-system-prompt-diff-lines requires --baseline-system-prompt-file");
    }
  }
  const isPromptAblation = (ablationKey ?? "").toLowerCase().startsWith("prompt.");
  if (isPromptAblation) {
    if (!baselineSystemPromptFile) {
      throw new Error(
        "Prompt ablation guard: --baseline-system-prompt-file is required for prompt.* experiments to prevent stacked prompt changes.",
      );
    }
    if (expectedSystemPromptDiffLines === undefined) {
      throw new Error(
        "Prompt ablation guard: --expected-system-prompt-diff-lines is required for prompt.* experiments.",
      );
    }
  }
  if (turnCapPlies > 30 && !unsafeAllowLong) {
    throw new Error("Policy: --turn-cap-plies must be <= 30 on v0/v0.x (pass --unsafe-allow-long true to override).");
  }

  let seeds: number[] = [];
  let usedSeedProfile: string | undefined = undefined;
  if (seedsRaw) {
    if (seedProfileArg) console.log("WARN --seed-profile ignored because --seeds was provided.");
    seeds = seedsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number.parseInt(s, 10));
    if (seeds.some((s) => !Number.isInteger(s) || s < 0)) throw new Error("--seeds must be a comma-separated list of integers >=0");
  } else if (hasExplicitSeedRange) {
    if (seedProfileArg) console.log("WARN --seed-profile ignored because --seed-start/--seed/--games/--trials were provided.");
    const seedStart = Number.parseInt(seedStartRaw ?? "3", 10);
    const games = Number.parseInt(gamesRaw ?? "3", 10);
    if (!Number.isInteger(seedStart) || seedStart < 0) throw new Error("--seed-start/--seed must be an integer >= 0");
    if (!Number.isInteger(games) || games < 1 || games > 50) throw new Error("--games/--trials must be an integer in [1,50]");
    if (games > 5 && !unsafeAllowMany) {
      throw new Error("Policy: --games/--trials must be <= 5 on v0/v0.x (pass --unsafe-allow-many true to override).");
    }
    seeds = Array.from({ length: games }, (_, i) => seedStart + i);
  } else {
    const profileName = seedProfile ?? experimentPolicy.defaultSeedProfile;
    const profileSeeds = experimentPolicy.seedProfiles[profileName];
    if (!profileSeeds || profileSeeds.length === 0) {
      throw new Error(
        `Unknown or empty --seed-profile '${profileName}'. Available profiles: ${Object.keys(experimentPolicy.seedProfiles)
          .sort()
          .join(", ")}`,
      );
    }
    seeds = profileSeeds.slice();
    usedSeedProfile = profileName;
    console.log(`Using seed profile '${profileName}': ${seeds.join(",")}`);
  }
  if (seeds.length > 5 && !unsafeAllowMany) {
    throw new Error("Policy: number of seeds/games must be <= 5 on v0/v0.x (pass --unsafe-allow-many true to override).");
  }

  const scenario = await loadScenarioFromFile(scenarioPath);
  const scenarioSource = await readFile(scenarioPath, "utf8");
  const scenarioSha256 = sha256Hex(scenarioSource);
  scenario.settings.turnCapPlies = turnCapPlies;
  const adjacency = createAdjacency(scenario);
  const observation = toObservationFromScenario(scenario as any);
  const promptModeResolved = promptMode === "full" ? "full" : "compact";
  const timeoutMsResolved = parsePositiveInt(openAiTimeoutMsArg, 70000);
  const thinkHintResolved = parseOnOff(thinkHint, true);
  const memoryEnabled = parseOnOff(memory, false);
  const warmupMode = (warmup ?? "off").toLowerCase();
  const rationaleStyleResolved = parseRationaleStyle(rationaleStyle);
  const promptSnapshot = buildOpenAiCompatPromptSnapshot({
    request: {
      api_version: "0.1",
      match_id: `${scenario.id}_snapshot_${conditionId}`,
      player: "P1",
      scenario_id: scenario.id,
      ply: 0,
      action_budget: scenario.settings.actionBudget,
      observation,
    },
    scenario: scenario as any,
    adjacency,
    promptMode: promptModeResolved,
    timeoutMs: timeoutMsResolved,
    allowMemoryUpdate: memoryEnabled && warmupMode === "inline",
    purpose: "act",
    thinkHint: thinkHintResolved,
    rationaleStyle: rationaleStyleResolved,
  });
  const systemPromptSha256 = sha256Hex(promptSnapshot.systemPrompt);
  let baselineSystemPromptSha256: string | undefined = undefined;
  let systemPromptLineDiffVsBaseline: number | undefined = undefined;
  if (baselineSystemPromptFile) {
    const baselinePrompt = await readFile(baselineSystemPromptFile, "utf8");
    baselineSystemPromptSha256 = sha256Hex(baselinePrompt);
    systemPromptLineDiffVsBaseline = lineDiffCount(baselinePrompt, promptSnapshot.systemPrompt);
    console.log(
      `Prompt guard: currentSha=${systemPromptSha256} baselineSha=${baselineSystemPromptSha256} diffLines=${systemPromptLineDiffVsBaseline}`,
    );
    if (
      expectedSystemPromptDiffLines !== undefined &&
      systemPromptLineDiffVsBaseline !== expectedSystemPromptDiffLines
    ) {
      throw new Error(
        `Prompt ablation guard failed: diffLines=${systemPromptLineDiffVsBaseline}, expected=${expectedSystemPromptDiffLines}.`,
      );
    }
  }
  const replaysDir = replaysDirArg ?? path.join("replays", "model_evals", pacificFileStamp());
  const git = getGitMeta();

  const experimentMeta: ExperimentMeta = {
    runId,
    experimentId,
    conditionId,
    baselineConditionId,
    ablationKey,
  };

  const rows: Row[] = [];
  const gameMetricsRows: Array<Record<string, unknown>> = [];
  const turnMetricsRows: Array<Record<string, unknown>> = [];

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
        experiment: experimentMeta,
        providerName,
        keysFile,
        keysName,
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
        fallback,
        toolsMode,
        stream,
        thinkHint,
        reasoningEffort,
        rationaleStyle,
        reasoningSplit,
        memory,
        memoryMaxChars,
        warmup,
        warmupTimeoutMs,
        warmupMaxTokens,
        repair,
        repairMaxRounds,
        retryOnFailure,
        retryReasoningEffort,
        selectMode,
        selectK,
        selectCandidateTemperature,
        selectUntilPly,
        promptMode,
        stopAfterErrors,
        saveReplays: true,
        replaysDir,
        liveOut,
        agentLogDir,
        serverLogDir,
        gameMetricsRows,
        turnMetricsRows,
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

  const summaryPayload = {
    runId,
    createdAt: runStartedAt,
    experimentId,
    conditionId,
    baselineConditionId,
    ablationKey,
    hypothesis,
    notes,
    seedProfile: usedSeedProfile,
    controlRerunEveryVariants: experimentPolicy.controlRerunEveryVariants,
    seeds,
    plannedGames: seeds.length,
    provider: providerName,
    opponent,
    mixGreedyProb: opponent === "mix" ? mixGreedyProb : undefined,
    useTools,
    fallback,
    toolsMode,
    stream,
    reasoningEffort,
    rationaleStyle,
    systemPromptSha256,
    baselineSystemPromptFile,
    baselineSystemPromptSha256,
    systemPromptLineDiffVsBaseline,
    expectedSystemPromptDiffLines,
    reasoningSplit,
    promptMode,
    memory,
    memoryMaxChars,
    warmup,
    warmupTimeoutMs,
    warmupMaxTokens,
    repair,
    repairMaxRounds,
    retryOnFailure,
    retryReasoningEffort,
    selectMode,
    selectK,
    selectCandidateTemperature,
    selectUntilPly,
    saveReplays,
    replaysDir,
    rows,
  };

  if (summaryOutPath) {
    await mkdir(path.dirname(summaryOutPath), { recursive: true });
    await writeFile(summaryOutPath, JSON.stringify(summaryPayload, null, 2), "utf8");
    console.log(`Wrote: ${summaryOutPath}`);
  }

  if (gameMetricsOutPath) {
    await mkdir(path.dirname(gameMetricsOutPath), { recursive: true });
    const text = gameMetricsRows.map((r) => JSON.stringify(r)).join("\n");
    await writeFile(gameMetricsOutPath, text.length > 0 ? `${text}\n` : "", "utf8");
    console.log(`Wrote: ${gameMetricsOutPath}`);
  }

  if (turnMetricsOutPath) {
    await mkdir(path.dirname(turnMetricsOutPath), { recursive: true });
    const text = turnMetricsRows.map((r) => JSON.stringify(r)).join("\n");
    await writeFile(turnMetricsOutPath, text.length > 0 ? `${text}\n` : "", "utf8");
    console.log(`Wrote: ${turnMetricsOutPath}`);
  }

  if (manifestOutPath) {
    const finishedAt = pacificIsoString();
    const runDurationMs = Date.now() - runStartedAtMs;
    const modelsSource = modelsRaw ? "arg" : modelsFile ? "file" : "allowlist_baseline";
    const manifest = {
      schemaVersion: "asg.experiment_run.v1",
      runId,
      createdAt: runStartedAt,
      finishedAt,
      durationMs: runDurationMs,
      experiment: {
        experimentId,
        conditionId,
        baselineConditionId,
        ablationKey,
        hypothesis,
        notes,
      },
      git,
      command: {
        argv: process.argv.slice(2),
        cwd: process.cwd(),
      },
      scenario: {
        path: scenarioPath,
        sha256: scenarioSha256,
        id: scenario.id,
      },
      setup: {
        providerName,
        baseUrl,
        keysFile,
        keysName,
        seedPolicyPath: path.relative(process.cwd(), experimentPolicyPath),
        seedProfile: usedSeedProfile,
        controlRerunEveryVariants: experimentPolicy.controlRerunEveryVariants,
        models,
        modelsSource,
        modelsConfig,
        opponent,
        mixGreedyProb: opponent === "mix" ? mixGreedyProb : undefined,
        seeds,
        plannedGames: seeds.length,
        turnCapPlies,
        stopAfterErrors,
      },
      runtime: {
        openAiTimeoutMs: openAiTimeoutMsArg ?? "70000",
        agentTimeoutMs,
        maxTokens,
        temperature,
        useTools,
        fallback,
        toolsMode,
        stream,
        thinkHint,
        reasoningEffort,
        rationaleStyle,
        systemPromptSha256,
        baselineSystemPromptFile,
        baselineSystemPromptSha256,
        systemPromptLineDiffVsBaseline,
        expectedSystemPromptDiffLines,
        reasoningSplit,
        promptMode,
        memory,
        memoryMaxChars,
        warmup,
        warmupTimeoutMs,
        warmupMaxTokens,
        repair,
        repairMaxRounds,
        retryOnFailure,
        retryReasoningEffort,
        selectMode,
        selectK,
        selectCandidateTemperature,
        selectUntilPly,
        validateModels,
      },
      outputs: {
        summaryPath: summaryOutPath,
        manifestPath: manifestOutPath,
        gameMetricsPath: gameMetricsOutPath,
        turnMetricsPath: turnMetricsOutPath,
        liveOutPath: liveOut,
        replaysDir,
        agentLogDir,
        serverLogDir,
      },
      summary: summaryPayload,
      counts: {
        modelsTotal: models.length,
        gamesPlayed: rows.reduce((sum, r) => sum + r.games, 0),
        gameMetricRows: gameMetricsRows.length,
        turnMetricRows: turnMetricsRows.length,
      },
    };

    await mkdir(path.dirname(manifestOutPath), { recursive: true });
    await writeFile(manifestOutPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`Wrote: ${manifestOutPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
