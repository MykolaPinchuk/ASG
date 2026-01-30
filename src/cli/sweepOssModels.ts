import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import { RandomBot } from "../controllers/randomBot.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { MixBot } from "../controllers/mixBot.js";
import type { Controller } from "../controllers/controller.js";
import type { PlayerId, Replay } from "../game/types.js";
import { openAiCompatAct } from "../providers/openaiCompat.js";
import { getProviderAllowlist, loadOssModelsConfig } from "../llm/models.js";

type ProviderName = "nanogpt" | "chutes" | "openrouter";
type Opponent = "greedy" | "random" | "mix";
type SweepMode = "smoke" | "full" | "both";

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

function nowStampPacific(): string {
  // Good enough; avoid depending on system TZ config.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function looksLikeReasoningModelId(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.includes(":thinking") || m.includes("thinking") || m.includes("reasoning") || m.includes("deepseek-r1") || m.includes("deepseek_r1");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractModelIds(payload: unknown): string[] {
  if (!isObject(payload)) return [];
  const p = payload as any;
  const candidates = p.data ?? p.models ?? p.items ?? p.result ?? p;
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const item of candidates) {
    const id = item?.id ?? item?.name ?? item?.model;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return Array.from(new Set(ids)).sort();
}

async function fetchModels(params: { baseUrl: string; apiKey?: string }): Promise<string[]> {
  const url = normalizeBaseUrl(params.baseUrl) + "/models";
  const headers: Record<string, string> = {};
  if (params.apiKey) headers.authorization = `Bearer ${params.apiKey}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text);
  return extractModelIds(json);
}

function pickOssCandidates(
  provider: ProviderName,
  all: string[],
  max: number,
  extraDeny: string[],
  extraDenyPrefixes: string[],
): string[] {
  const denyPrefixes = [
    "openai/",
    "anthropic/",
    "google/",
    "cohere/",
    "x-ai/",
    "ai21/",
    "perplexity/",
    "amazon/",
  ];
  const allowPrefixes = [
    "deepseek",
    "deepseek-ai/",
    "qwen/",
    "Qwen/",
    "mistralai/",
    "zai-org/",
    "microsoft/",
    "tiiuae/",
    "01-ai/",
    "google/gemma",
    "nvidia/",
  ];

  const denySet = new Set(extraDeny);
  const extraDenyPrefixesNorm = extraDenyPrefixes.map((p) => p.toLowerCase());
  const filtered = all.filter((id) => {
    if (!id.includes("/")) return false;
    const lower = id.toLowerCase();
    if (denyPrefixes.some((p) => lower.startsWith(p))) return false;
    if (denySet.has(id)) return false;
    if (extraDenyPrefixesNorm.some((p) => lower.startsWith(p))) return false;
    return true;
  });

  const preferred: string[] = [];
  const rest: string[] = [];
  for (const id of filtered) {
    if (allowPrefixes.some((p) => id.startsWith(p) || id.toLowerCase().startsWith(p.toLowerCase()))) preferred.push(id);
    else rest.push(id);
  }

  const ordered = provider === "openrouter" ? [...preferred, ...rest] : [...preferred, ...rest];
  return ordered.slice(0, max);
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseBoolFlag(value: string | undefined, defaultValue: boolean): boolean {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  throw new Error(`invalid boolean flag value '${value}' (expected true|false)`);
}

type ModelRunSummary = {
  provider: ProviderName;
  baseUrl: string;
  model: string;
  phase: "smoke" | "full";
  seed: number;
  turnCapPlies: number;
  plies: number;
  result: Replay["result"];
  agentPassTurns: number;
  providerErrorTurns: number;
  agentMoveActions: number;
  agentReinforceActions: number;
  agentCaptures: number;
  agentCombats: number;
  agentInvalidActions: number;
  replayPath?: string;
};

function summarizeReplay(replay: Replay, agentPlayer: PlayerId) {
  const agentTurns = replay.turns.filter((t) => t.player === agentPlayer);
  const passTurns = agentTurns.filter((t) => (t.actions ?? []).length === 0 || (t.actions ?? []).every((a) => a.type === "pass")).length;
  const providerErrorTurns = agentTurns.filter((t) => (t.rationaleText ?? "").includes("openai_compat failed")).length;
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
    agentPassTurns: passTurns,
    providerErrorTurns,
    agentMoveActions: moveActions,
    agentReinforceActions: reinforceActions,
    agentCaptures: captureEvents,
    agentCombats: combatEvents,
    agentInvalidActions: invalidActionEvents,
  };
}

async function runAgentMatch(params: {
  provider: ProviderName;
  baseUrl: string;
  keysFilePath: string;
  modelsConfigPath: string;
  model: string;
  opponent: Opponent;
  mixGreedyProb: number;
  useTools: boolean;
  promptMode?: string;
  reasoningEffort?: string;
  temperature: string;
  maxTokens: string;
  timeoutMs: string;
  baseScenario: any;
  adjacency: Record<string, string[]>;
  seed: number;
  turnCapPlies: number;
  outReplayPath?: string;
  stopAfterErrors: number;
}): Promise<ModelRunSummary> {
  const scenario = structuredClone(params.baseScenario);
  scenario.settings.turnCapPlies = params.turnCapPlies;
  const adjacency = params.adjacency;
  const ctx = { scenario, adjacency };

  const args = new Map<string, string>();
  args.set("--provider-name", params.provider);
  args.set("--base-url", params.baseUrl);
  args.set("--keys-file", params.keysFilePath);
  args.set("--models-config", params.modelsConfigPath);
  args.set("--model", params.model);
  args.set("--timeout-ms", params.timeoutMs);
  args.set("--temperature", params.temperature);
  args.set("--max-tokens", params.maxTokens);
  args.set("--use-tools", params.useTools ? "true" : "false");
  if (params.promptMode) args.set("--prompt-mode", params.promptMode);
  if (params.reasoningEffort) args.set("--reasoning-effort", params.reasoningEffort);

  const agentPlayer: PlayerId = "P1";
  const opponentSeed = params.seed + 202;
  const opponentController: Controller =
    params.opponent === "random"
      ? new RandomBot({ seed: opponentSeed, adjacency, scenario })
      : params.opponent === "mix"
        ? new MixBot({ seed: opponentSeed, adjacency, scenario, greedyProb: params.mixGreedyProb })
        : new GreedyBot({ adjacency, scenario });

  let errorTurns = 0;
  let earlyStopTriggered = false;

  const controllers: Record<PlayerId, Controller> = {
    P1: {
      id: "agent",
      decide: async (observation) => {
        const request: any = {
          api_version: "0.1",
          match_id: `${scenario.id}_seed${params.seed}_${params.provider}_${params.model}`,
          player: agentPlayer,
          scenario_id: scenario.id,
          ply: observation.ply,
          action_budget: scenario.settings.actionBudget,
          observation: observation as any,
        };

        try {
          const out = await openAiCompatAct({
            request,
            scenario: scenario as any,
            adjacency: adjacency as any,
            args,
          });
          // Attach metadata if the replay schema supports it.
          (request as any)._agent_info = out;
          return { actions: out.response.actions, rationaleText: out.response.rationale_text };
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          errorTurns += 1;
          if (!earlyStopTriggered && params.stopAfterErrors > 0 && errorTurns >= params.stopAfterErrors) {
            const nextPly = observation.ply + 1;
            scenario.settings.turnCapPlies = Math.min(scenario.settings.turnCapPlies ?? nextPly, nextPly);
            earlyStopTriggered = true;
          }
          return { actions: [{ type: "pass" }], rationaleText: `openai_compat failed: ${err}` };
        }
      },
    },
    P2: opponentController,
  };

  const replay = await runMatch({ ctx, controllers, seed: params.seed });

  replay.players = {
    P1: { kind: "agent", provider: params.provider, baseUrl: params.baseUrl, model: params.model, modelMode: "explicit" },
    P2: params.opponent === "mix" ? { kind: "mix", greedyProb: params.mixGreedyProb } : { kind: params.opponent },
  };

  if (params.outReplayPath) {
    await mkdir(path.dirname(params.outReplayPath), { recursive: true });
    await writeFile(params.outReplayPath, JSON.stringify(replay, null, 2), "utf8");
  }

  const summary = summarizeReplay(replay, agentPlayer);
  return {
    provider: params.provider,
    baseUrl: params.baseUrl,
    model: params.model,
    phase: "smoke",
    seed: params.seed,
    turnCapPlies: params.turnCapPlies,
    plies: replay.turns.length,
    result: replay.result,
    ...summary,
    replayPath: params.outReplayPath,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const unsafeAllowLong = (args.get("--unsafe-allow-long") ?? "false").toLowerCase() === "true";
  const keysFilePath = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const keys = parseKeysFile(await (await import("node:fs/promises")).readFile(keysFilePath, "utf8"));

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const outRoot = args.get("--out-dir") ?? path.join("runs", "model_sweeps", nowStampPacific());
  const replaysDir = args.get("--replays-dir") ?? "replays";
  const baseScenario = await loadScenarioFromFile(scenarioPath);
  const adjacency = createAdjacency(baseScenario);

  const providersRaw = (args.get("--providers") ?? "nanogpt,chutes").split(",").map((s) => s.trim()).filter(Boolean);
  const providers = providersRaw.filter((p): p is ProviderName => ["nanogpt", "chutes", "openrouter"].includes(p));

  const modeRaw = (args.get("--mode") ?? "both").toLowerCase();
  if (!["both", "smoke", "full"].includes(modeRaw)) throw new Error("--mode must be both|smoke|full");
  const mode = modeRaw as SweepMode;
  const runSmoke = mode !== "full";
  const runFull = mode !== "smoke";

  const opponentRaw = (args.get("--opponent") ?? "greedy").toLowerCase();
  if (!["greedy", "random", "mix"].includes(opponentRaw)) throw new Error("--opponent must be greedy|mix|random");
  const opponent = opponentRaw as Opponent;
  const mixGreedyProb = Number.parseFloat(args.get("--mix-greedy-prob") ?? "0.5");

  const maxModels = Number.parseInt(args.get("--max-models") ?? "30", 10);
  const smokeTurnCap = Number.parseInt(args.get("--smoke-turn-cap") ?? "10", 10);
  const fullTurnCap = Number.parseInt(args.get("--full-turn-cap") ?? "30", 10);
  const fullSeed = Number.parseInt(args.get("--full-seed") ?? "3", 10);
  const smokeSeedStart = Number.parseInt(args.get("--smoke-seed-start") ?? "1000", 10);
  const stopAfterErrors = Number.parseInt(args.get("--stop-after-errors") ?? "1", 10);
  const excludeModels = new Set(parseCsvList(args.get("--exclude-models")));
  const reasoningEffort = args.get("--reasoning-effort") ?? undefined;
  const reasoningEffortLowModels = new Set(parseCsvList(args.get("--reasoning-effort-low-models")));
  const onlyReasoning = parseBoolFlag(args.get("--only-reasoning"), false);
  const preferReasoning = parseBoolFlag(args.get("--prefer-reasoning"), false);

  const timeoutMsArg = args.get("--timeout-ms") ?? undefined;
  const maxTokensArg = args.get("--max-tokens") ?? undefined;
  const temperature = args.get("--temperature") ?? "0";
  const promptMode = args.get("--prompt-mode") ?? undefined;
  const modelsConfigPath = args.get("--models-config") ?? "configs/oss_models.json";
  const modelsConfig = await loadOssModelsConfig(modelsConfigPath);

  if (!Number.isInteger(maxModels) || maxModels < 1 || maxModels > 80) throw new Error("--max-models must be in [1,80]");
  if (!Number.isInteger(smokeTurnCap) || smokeTurnCap < 2) throw new Error("--smoke-turn-cap must be >=2");
  if (!Number.isInteger(fullTurnCap) || fullTurnCap < 2) throw new Error("--full-turn-cap must be >=2");
  if (!Number.isInteger(fullSeed) || fullSeed < 0) throw new Error("--full-seed must be >=0");
  if (!Number.isInteger(smokeSeedStart) || smokeSeedStart < 0) throw new Error("--smoke-seed-start must be >=0");
  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");
  if (!Number.isInteger(stopAfterErrors) || stopAfterErrors < 0 || stopAfterErrors > 30) throw new Error("--stop-after-errors must be in [0,30]");
  if ((smokeTurnCap > 30 || fullTurnCap > 30) && !unsafeAllowLong) {
    throw new Error("Policy: --smoke-turn-cap/--full-turn-cap must be <= 30 on v0/v05 (pass --unsafe-allow-long true to override).");
  }

  await mkdir(outRoot, { recursive: true });

  const runSummary: any = {
    startedAt: new Date().toISOString(),
    scenarioPath,
    mode,
    replaysDir,
    opponent: opponent === "mix" ? { kind: "mix", greedyProb: mixGreedyProb } : { kind: opponent },
    stopAfterErrors,
    smoke: { turnCapPlies: smokeTurnCap, seedStart: smokeSeedStart },
    full: { turnCapPlies: fullTurnCap, seed: fullSeed },
    providers: {},
  };

  for (const provider of providers) {
    const providerKey = keys.get(provider) ?? "";
    if (!providerKey) {
      console.log(`SKIP provider=${provider} (no key in ${keysFilePath})`);
      continue;
    }

    const baseUrlKey = `${provider}_base_url`;
    const baseUrl =
      (provider === "chutes" ? "https://llm.chutes.ai/v1" : "") ||
      keys.get(baseUrlKey) ||
      (provider === "openrouter" ? "https://openrouter.ai/api/v1" : "");
    if (!baseUrl) {
      console.log(`SKIP provider=${provider} (no baseUrl; expected ${baseUrlKey} in ${keysFilePath} or default)`);
      continue;
    }

    console.log(`provider=${provider} baseUrl=${baseUrl}`);

    let ids: string[] = [];
    try {
      ids = await fetchModels({ baseUrl, apiKey: providerKey });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      console.log(`FAILED to list models for provider=${provider}: ${err}`);
      continue;
    }

    const { deny, denyPrefixes } = getProviderAllowlist(modelsConfig, provider);
    let candidates = pickOssCandidates(provider, ids, maxModels + excludeModels.size + 50, deny, denyPrefixes).filter((m) => !excludeModels.has(m));
    if (onlyReasoning) candidates = candidates.filter((m) => looksLikeReasoningModelId(m));
    if (preferReasoning) {
      candidates = candidates.slice().sort((a, b) => {
        const ar = looksLikeReasoningModelId(a) ? 0 : 1;
        const br = looksLikeReasoningModelId(b) ? 0 : 1;
        return ar - br || a.localeCompare(b);
      });
    }
    candidates = candidates.slice(0, maxModels);
    const providerOutDir = path.join(outRoot, provider);
    await mkdir(providerOutDir, { recursive: true });
    await writeFile(path.join(providerOutDir, "models.txt"), candidates.join("\n") + "\n", "utf8");

    const models: any[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const model = candidates[i]!;
      const smokeSeed = smokeSeedStart + i;
      const useTools = provider !== "chutes"; // chutes appears less compatible with tools

      const timeoutMs = timeoutMsArg ?? "70000";
      const maxTokens = maxTokensArg ?? (looksLikeReasoningModelId(model) ? "600" : "180");

      let smoke: ModelRunSummary | undefined;
      if (runSmoke) {
        const smokeReplayPath = path.join(
          replaysDir,
          `${path.basename(scenarioPath, ".json")}_seed${smokeSeed}_${provider}_${encodeURIComponent(model)}_smoke.json`,
        );
        smoke = await runAgentMatch({
          provider,
          baseUrl,
          keysFilePath,
          modelsConfigPath: args.get("--models-config") ?? "configs/oss_models.json",
          model,
          opponent,
          mixGreedyProb,
          useTools,
          promptMode,
          reasoningEffort: reasoningEffortLowModels.has(model) ? "low" : reasoningEffort,
          temperature,
          maxTokens,
          timeoutMs,
          baseScenario,
          adjacency,
          seed: smokeSeed,
          turnCapPlies: smokeTurnCap,
          outReplayPath: smokeReplayPath,
          stopAfterErrors,
        });
      }

      const smokeOk = smoke ? smoke.providerErrorTurns === 0 && smoke.agentMoveActions + smoke.agentReinforceActions > 0 : true;
      if (smoke) {
        console.log(
          `smoke ${provider} model=${model} ok=${smokeOk} providerErrors=${smoke.providerErrorTurns} passTurns=${smoke.agentPassTurns} moves=${smoke.agentMoveActions} caps=${smoke.agentCaptures}`,
        );
      }

      const entry: any = { model, smoke, smokeOk };

      if (runFull && smokeOk) {
        const fullReplayPath = path.join(
          replaysDir,
          `${path.basename(scenarioPath, ".json")}_seed${fullSeed}_${provider}_${encodeURIComponent(model)}_full.json`,
        );
        const full = await runAgentMatch({
          provider,
          baseUrl,
          keysFilePath,
          modelsConfigPath: args.get("--models-config") ?? "configs/oss_models.json",
          model,
          opponent,
          mixGreedyProb,
          useTools,
          promptMode,
          reasoningEffort: reasoningEffortLowModels.has(model) ? "low" : reasoningEffort,
          temperature,
          maxTokens,
          timeoutMs,
          baseScenario,
          adjacency,
          seed: fullSeed,
          turnCapPlies: fullTurnCap,
          outReplayPath: fullReplayPath,
          stopAfterErrors,
        });
        full.phase = "full";
        entry.full = full;
        console.log(
          `full  ${provider} model=${model} result=${full.result.type === "win" ? `WIN_${full.result.winner}` : "DRAW"} providerErrors=${full.providerErrorTurns} moves=${full.agentMoveActions} caps=${full.agentCaptures}`,
        );
      }

      models.push(entry);

      await writeFile(path.join(providerOutDir, "results.json"), JSON.stringify(models, null, 2), "utf8");
    }

    runSummary.providers[provider] = {
      baseUrl,
      candidateCount: candidates.length,
      resultsPath: path.join(providerOutDir, "results.json"),
    };
  }

  await writeFile(path.join(outRoot, "summary.json"), JSON.stringify(runSummary, null, 2), "utf8");
  await writeFile(
    path.join(outRoot, "summary.md"),
    [
      `# Model sweep`,
      ``,
      `- startedAt: ${runSummary.startedAt}`,
      `- scenario: ${scenarioPath}`,
      `- smoke: turnCapPlies=${smokeTurnCap}, seedStart=${smokeSeedStart}`,
      `- full: seed=${fullSeed}, turnCapPlies=${fullTurnCap}`,
      ``,
      `## Providers`,
      ...Object.entries(runSummary.providers).map(([p, v]: any) => `- ${p}: baseUrl=${v.baseUrl}, candidates=${v.candidateCount}, results=${v.resultsPath}`),
      ``,
    ].join("\n"),
    "utf8",
  );

  console.log(`DONE. Summary: ${path.join(outRoot, "summary.md")}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
