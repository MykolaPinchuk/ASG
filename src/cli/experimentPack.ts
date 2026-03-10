import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createAdjacency } from "../game/scenario.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import { buildOpenAiCompatPromptSnapshot } from "../providers/openaiCompat.js";
import { pacificIsoString } from "../utils/pacificTime.js";
import { updateExperimentsIndexRegistry } from "../experiments/indexRegistry.js";

type PlayerId = "P1" | "P2";
const scenarioCache = new Map<string, Awaited<ReturnType<typeof loadScenarioFromFile>>>();

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type ConditionState = {
  model: {
    providerName?: string;
    baseUrl?: string;
    models: string[];
    modelsSource?: string;
    modelsConfig?: string;
  };
  scenario: {
    path: string;
    id?: string;
    sha256?: string;
  };
  matchup: {
    opponent?: string;
    mixGreedyProb?: number;
    seedProfile?: string;
    controlRerunEveryVariants?: number;
    seeds: number[];
    plannedGames?: number;
    turnCapPlies?: number;
    stopAfterErrors?: number;
  };
  runtime: {
    openAiTimeoutMs?: string;
    agentTimeoutMs?: number;
    maxTokens?: string;
    temperature?: string;
    useTools?: boolean;
    fallback?: string;
    toolsMode?: string;
    stream?: string;
    thinkHint?: string;
    reasoningEffort?: string;
    rationaleStyle?: string;
    reasoningSplit?: string;
    promptMode?: string;
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
    validateModels?: boolean;
  };
};

type ConditionDoc = {
  schemaVersion: "asg.experiment_condition.v1";
  conditionId: string;
  state: ConditionState;
  source: {
    manifestPath: string;
    runId?: string;
    createdAt?: string;
    finishedAt?: string;
    commit?: string;
  };
  links: {
    summaryPath?: string;
    gameMetricsPath?: string;
    turnMetricsPath?: string;
    replaysDir?: string;
  };
};

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key || !key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      args.set(key, "true");
      continue;
    }
    args.set(key, value);
    i += 1;
  }
  return args;
}

function mustArg(args: Map<string, string>, key: string): string {
  const value = args.get(key);
  if (!value) throw new Error(`missing required ${key}`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toRepoRel(repoRoot: string, p: string | undefined): string | undefined {
  if (!p) return undefined;
  if (path.isAbsolute(p)) return path.relative(repoRoot, p);
  return p;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string");
}

function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item === "number" && Number.isFinite(item)) out.push(Math.floor(item));
  }
  return out;
}

async function loadJson(filePath: string): Promise<unknown> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text);
}

function normalizeConditionFromManifest(params: {
  manifest: unknown;
  manifestPath: string;
  conditionId: string;
  repoRoot: string;
}): ConditionDoc {
  const m = isObject(params.manifest) ? params.manifest : {};
  const setup = isObject(m.setup) ? m.setup : {};
  const runtime = isObject(m.runtime) ? m.runtime : {};
  const scenario = isObject(m.scenario) ? m.scenario : {};
  const outputs = isObject(m.outputs) ? m.outputs : {};
  const summary = isObject(m.summary) ? m.summary : {};

  return {
    schemaVersion: "asg.experiment_condition.v1",
    conditionId: params.conditionId,
    state: {
      model: {
        providerName: asString(setup.providerName),
        baseUrl: asString(setup.baseUrl),
        models: asStringArray(setup.models),
        modelsSource: asString(setup.modelsSource),
        modelsConfig: asString(setup.modelsConfig),
      },
      scenario: {
        path: asString(scenario.path) ?? "scenarios/scenario_01.json",
        id: asString(scenario.id),
        sha256: asString(scenario.sha256),
      },
      matchup: {
        opponent: asString(setup.opponent),
        mixGreedyProb: asNumber(setup.mixGreedyProb),
        seedProfile: asString(setup.seedProfile),
        controlRerunEveryVariants: asNumber(setup.controlRerunEveryVariants),
        seeds: asNumberArray(setup.seeds),
        plannedGames: asNumber(setup.plannedGames),
        turnCapPlies: asNumber(setup.turnCapPlies),
        stopAfterErrors: asNumber(setup.stopAfterErrors),
      },
      runtime: {
        openAiTimeoutMs: asString(runtime.openAiTimeoutMs),
        agentTimeoutMs: asNumber(runtime.agentTimeoutMs),
        maxTokens: asString(runtime.maxTokens),
        temperature: asString(runtime.temperature),
        useTools: asBool(runtime.useTools),
        fallback: asString(runtime.fallback),
        toolsMode: asString(runtime.toolsMode),
        stream: asString(runtime.stream),
        thinkHint: asString(runtime.thinkHint),
        reasoningEffort: asString(runtime.reasoningEffort),
        rationaleStyle: asString(runtime.rationaleStyle),
        reasoningSplit: asString(runtime.reasoningSplit),
        promptMode: asString(runtime.promptMode),
        memory: asString(runtime.memory),
        memoryMaxChars: asString(runtime.memoryMaxChars),
        warmup: asString(runtime.warmup),
        warmupTimeoutMs: asString(runtime.warmupTimeoutMs),
        warmupMaxTokens: asString(runtime.warmupMaxTokens),
        repair: asString(runtime.repair),
        repairMaxRounds: asString(runtime.repairMaxRounds),
        retryOnFailure: asString(runtime.retryOnFailure),
        retryReasoningEffort: asString(runtime.retryReasoningEffort),
        selectMode: asString(runtime.selectMode),
        selectK: asString(runtime.selectK),
        selectCandidateTemperature: asString(runtime.selectCandidateTemperature),
        selectUntilPly: asString(runtime.selectUntilPly),
        validateModels: asBool(runtime.validateModels),
      },
    },
    source: {
      manifestPath: toRepoRel(params.repoRoot, params.manifestPath) ?? params.manifestPath,
      runId: asString(m.runId),
      createdAt: asString(m.createdAt),
      finishedAt: asString(m.finishedAt),
      commit: isObject(m.git) ? asString(m.git.commit) : undefined,
    },
    links: {
      summaryPath: toRepoRel(params.repoRoot, asString(outputs.summaryPath) ?? asString(summary.outPath)),
      gameMetricsPath: toRepoRel(params.repoRoot, asString(outputs.gameMetricsPath)),
      turnMetricsPath: toRepoRel(params.repoRoot, asString(outputs.turnMetricsPath)),
      replaysDir: toRepoRel(params.repoRoot, asString(outputs.replaysDir) ?? asString(summary.replaysDir)),
    },
  };
}

function cleanJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => cleanJson(v)) as T;
  }
  if (!isObject(value)) return value;
  const out: Record<string, unknown> = {};
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  for (const [k, v] of entries) {
    if (v === undefined) continue;
    const vv = cleanJson(v);
    if (Array.isArray(vv) && vv.length === 0) {
      out[k] = vv;
      continue;
    }
    out[k] = vv;
  }
  return out as T;
}

function toObservationFromScenario(scenario: {
  map: { nodes: Array<{ id: string; x: number; y: number; owner: string; supplyYield: number }> };
  initialState: { playerSupply: Record<PlayerId, number>; nodeForces: Record<string, Record<PlayerId, number>> };
}): {
  player: PlayerId;
  ply: number;
  activePlayer: PlayerId;
  supplies: Record<PlayerId, number>;
  nodes: Record<string, { id: string; x: number; y: number; owner: string; supplyYield: number; forces: Record<PlayerId, number> }>;
} {
  const nodes: Record<string, { id: string; x: number; y: number; owner: string; supplyYield: number; forces: Record<PlayerId, number> }> = {};
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
    player: "P1",
    ply: 0,
    activePlayer: "P1",
    supplies: {
      P1: Number.isFinite(scenario.initialState.playerSupply.P1) ? Math.max(0, Math.floor(scenario.initialState.playerSupply.P1)) : 0,
      P2: Number.isFinite(scenario.initialState.playerSupply.P2) ? Math.max(0, Math.floor(scenario.initialState.playerSupply.P2)) : 0,
    },
    nodes,
  };
}

function parseOnOff(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const v = raw.toLowerCase();
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

async function materializePromptAndRuleArtifacts(params: {
  repoRoot: string;
  expDir: string;
  condition: ConditionDoc;
}) {
  const conditionDir = path.join(params.expDir, "artifacts", params.condition.conditionId);
  const promptsDir = path.join(conditionDir, "prompts");
  await mkdir(promptsDir, { recursive: true });

  const scenarioPathAbs = path.resolve(params.repoRoot, params.condition.state.scenario.path);
  let scenario = scenarioCache.get(scenarioPathAbs);
  if (!scenario) {
    scenario = await loadScenarioFromFile(scenarioPathAbs);
    scenarioCache.set(scenarioPathAbs, scenario);
  }
  const adjacency = createAdjacency(scenario);
  const observation = toObservationFromScenario(scenario);

  const request = {
    api_version: "0.1",
    match_id: `${scenario.id}_snapshot_${params.condition.conditionId}`,
    player: "P1" as const,
    scenario_id: scenario.id,
    ply: 0,
    action_budget: scenario.settings.actionBudget,
    observation,
  };

  const promptMode = params.condition.state.runtime.promptMode === "full" ? "full" : "compact";
  const timeoutMs = parsePositiveInt(params.condition.state.runtime.openAiTimeoutMs, 70000);
  const thinkHint = parseOnOff(params.condition.state.runtime.thinkHint, true);
  const memoryEnabled = parseOnOff(params.condition.state.runtime.memory, false);
  const warmupMode = (params.condition.state.runtime.warmup ?? "off").toLowerCase();
  const rationaleStyle = params.condition.state.runtime.rationaleStyle === "structured10" ? "structured10" : "concise";

  const actSnapshot = buildOpenAiCompatPromptSnapshot({
    request,
    scenario,
    adjacency,
    promptMode,
    timeoutMs,
    allowMemoryUpdate: memoryEnabled,
    purpose: "act",
    thinkHint,
    rationaleStyle,
  });

  await writeFile(path.join(promptsDir, "system_prompt_act.txt"), actSnapshot.systemPrompt, "utf8");
  await writeFile(path.join(promptsDir, "user_prompt_template_act.txt"), actSnapshot.userPrompt, "utf8");

  if (memoryEnabled && warmupMode === "separate") {
    const warmupSnapshot = buildOpenAiCompatPromptSnapshot({
      request,
      scenario,
      adjacency,
      promptMode,
      timeoutMs,
      allowMemoryUpdate: true,
      purpose: "warmup",
      thinkHint,
      rationaleStyle,
    });
    await writeFile(path.join(promptsDir, "system_prompt_warmup.txt"), warmupSnapshot.systemPrompt, "utf8");
    await writeFile(path.join(promptsDir, "user_prompt_template_warmup.txt"), warmupSnapshot.userPrompt, "utf8");
  }

  const mvpSpec = await readFile(path.resolve(params.repoRoot, "docs/planning/MVP_SPEC.md"), "utf8");
  const gameRules = await readFile(path.resolve(params.repoRoot, "docs/GAME_RULES.md"), "utf8");
  const rulesSnapshot = [
    `# Rules Snapshot (${params.condition.conditionId})`,
    "",
    "This snapshot is frozen for this experiment condition.",
    "",
    "Source files:",
    "- `docs/planning/MVP_SPEC.md` (normative)",
    "- `docs/GAME_RULES.md` (human-readable reference)",
    "",
    "## MVP_SPEC.md",
    "",
    mvpSpec,
    "",
    "## GAME_RULES.md",
    "",
    gameRules,
    "",
  ].join("\n");
  await writeFile(path.join(conditionDir, "rules_snapshot.md"), rulesSnapshot, "utf8");
}

function collectDiffPaths(a: JsonValue, b: JsonValue, basePath = ""): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];

  const isObjA = isObject(a) && !Array.isArray(a);
  const isObjB = isObject(b) && !Array.isArray(b);
  if (!isObjA || !isObjB) return [basePath || "(root)"];

  const keys = new Set<string>([...Object.keys(a), ...Object.keys(b)]);
  const out: string[] = [];
  for (const key of Array.from(keys).sort()) {
    const nextPath = basePath ? `${basePath}.${key}` : key;
    out.push(...collectDiffPaths((a as Record<string, JsonValue>)[key], (b as Record<string, JsonValue>)[key], nextPath));
  }
  return out;
}

async function readJsonlRows(filePath: string | undefined): Promise<Array<Record<string, unknown>>> {
  if (!filePath) return [];
  try {
    const text = await readFile(filePath, "utf8");
    const rows: Array<Record<string, unknown>> = [];
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed);
      if (isObject(parsed)) rows.push(parsed);
    }
    return rows;
  } catch {
    return [];
  }
}

function toCsv(rows: string[][]): string {
  const esc = (s: string) => {
    if (s.includes(",") || s.includes("\n") || s.includes("\"")) {
      return `"${s.replaceAll("\"", "\"\"")}"`;
    }
    return s;
  };
  return rows.map((r) => r.map((c) => esc(c)).join(",")).join("\n") + "\n";
}

async function writeLatestAndReplayIndex(params: {
  repoRoot: string;
  expDir: string;
  expId: string;
  control: ConditionDoc;
  variant: ConditionDoc;
}) {
  const resultsDir = path.join(params.expDir, "results");
  await mkdir(resultsDir, { recursive: true });

  const controlGames = await readJsonlRows(
    params.control.links.gameMetricsPath ? path.resolve(params.repoRoot, params.control.links.gameMetricsPath) : undefined,
  );
  const variantGames = await readJsonlRows(
    params.variant.links.gameMetricsPath ? path.resolve(params.repoRoot, params.variant.links.gameMetricsPath) : undefined,
  );

  const replayRows: string[][] = [["condition", "seed", "result", "replayPath"]];
  for (const row of controlGames) {
    replayRows.push([
      params.control.conditionId,
      String(row.seed ?? ""),
      String(row.result ?? ""),
      String(row.replayPath ?? ""),
    ]);
  }
  for (const row of variantGames) {
    replayRows.push([
      params.variant.conditionId,
      String(row.seed ?? ""),
      String(row.result ?? ""),
      String(row.replayPath ?? ""),
    ]);
  }
  await writeFile(path.join(resultsDir, "replay_index.csv"), toCsv(replayRows), "utf8");

  const lineFor = (c: ConditionDoc) => [
    `- condition: \`${c.conditionId}\``,
    `- state: \`experiments/${params.expId}/conditions/${c.conditionId}.json\``,
    `- prompts/rules: \`experiments/${params.expId}/artifacts/${c.conditionId}/\``,
    `- run manifest: \`${c.source.manifestPath}\``,
    `- summary: \`${c.links.summaryPath ?? "(none)"}\``,
    `- game metrics: \`${c.links.gameMetricsPath ?? "(none)"}\``,
    `- turn metrics: \`${c.links.turnMetricsPath ?? "(none)"}\``,
    `- replay dir: \`${c.links.replaysDir ?? "(none)"}\``,
  ].join("\n");

  const latest = [
    `# ${params.expId} - Latest`,
    "",
    `Updated: ${pacificIsoString()}`,
    "",
    "## Baseline",
    lineFor(params.control),
    "",
    "## Variant",
    lineFor(params.variant),
    "",
    "## Replay Index",
    "- `experiments/<this-exp>/results/replay_index.csv`",
    "",
    "## Notes",
    "- Fill in decision summary after reviewing metrics/replays.",
    "",
  ].join("\n");

  await writeFile(path.join(resultsDir, "latest.md"), latest, "utf8");
}

async function upsertExperimentMeta(params: {
  expDir: string;
  expId: string;
  title?: string;
  objective?: string;
  hypothesis?: string;
}) {
  const filePath = path.join(params.expDir, "experiment.json");
  let current: Record<string, unknown> = {};
  try {
    const parsed = await loadJson(filePath);
    if (isObject(parsed)) current = parsed;
  } catch {
    // create new
  }

  const merged = cleanJson({
    schemaVersion: "asg.experiment_pack.v1",
    experimentId: params.expId,
    title: params.title ?? (typeof current.title === "string" ? current.title : params.expId),
    objective: params.objective ?? (typeof current.objective === "string" ? current.objective : undefined),
    hypothesis: params.hypothesis ?? (typeof current.hypothesis === "string" ? current.hypothesis : undefined),
    createdAt: typeof current.createdAt === "string" ? current.createdAt : pacificIsoString(),
    updatedAt: pacificIsoString(),
  });

  await writeFile(filePath, JSON.stringify(merged, null, 2) + "\n", "utf8");
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const root = args.get("--root") ?? "experiments";
  const expId = mustArg(args, "--exp-id");
  const controlManifestPath = path.resolve(repoRoot, mustArg(args, "--control-manifest"));
  const variantManifestPath = path.resolve(repoRoot, mustArg(args, "--variant-manifest"));
  const controlId = args.get("--control-id") ?? "control";
  const variantId = args.get("--variant-id") ?? "variant";
  const allowDiffPathsRaw = args.get("--allow-diff-paths") ?? "";
  const allowDiffPaths = allowDiffPathsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const rootAbs = path.resolve(repoRoot, root);
  const expDir = path.join(rootAbs, expId);
  await mkdir(path.join(expDir, "conditions"), { recursive: true });
  await mkdir(path.join(expDir, "artifacts"), { recursive: true });
  await mkdir(path.join(expDir, "results"), { recursive: true });

  const controlManifest = await loadJson(controlManifestPath);
  const variantManifest = await loadJson(variantManifestPath);

  const control = cleanJson(
    normalizeConditionFromManifest({
      manifest: controlManifest,
      manifestPath: controlManifestPath,
      conditionId: controlId,
      repoRoot,
    }),
  );
  const variant = cleanJson(
    normalizeConditionFromManifest({
      manifest: variantManifest,
      manifestPath: variantManifestPath,
      conditionId: variantId,
      repoRoot,
    }),
  );

  await upsertExperimentMeta({
    expDir,
    expId,
    title: args.get("--title") ?? undefined,
    objective: args.get("--objective") ?? undefined,
    hypothesis: args.get("--hypothesis") ?? undefined,
  });

  await writeFile(path.join(expDir, "conditions", `${controlId}.json`), JSON.stringify(control, null, 2) + "\n", "utf8");
  await writeFile(path.join(expDir, "conditions", `${variantId}.json`), JSON.stringify(variant, null, 2) + "\n", "utf8");

  await materializePromptAndRuleArtifacts({ repoRoot, expDir, condition: control });
  await materializePromptAndRuleArtifacts({ repoRoot, expDir, condition: variant });

  const diffPaths = collectDiffPaths(control.state as JsonValue, variant.state as JsonValue);
  const stateDiffLines = [
    `# State Diff (${controlId} vs ${variantId})`,
    "",
    `Generated: ${pacificIsoString()}`,
    "",
    "## Changed paths",
    ...diffPaths.map((p) => `- \`${p}\``),
    "",
  ];
  await writeFile(path.join(expDir, "results", "state_diff.md"), stateDiffLines.join("\n"), "utf8");

  if (allowDiffPaths.length > 0) {
    const unexpected = diffPaths.filter((p) => !allowDiffPaths.includes(p));
    if (unexpected.length > 0) {
      throw new Error(`ablation guard failed: unexpected diff paths: ${unexpected.join(", ")}`);
    }
    if (diffPaths.length === 0) {
      throw new Error("ablation guard failed: no state difference detected");
    }
  } else if (diffPaths.length !== 1) {
    throw new Error(
      `ablation guard failed: expected exactly 1 changed path, got ${diffPaths.length}. See experiments/${expId}/results/state_diff.md`,
    );
  }

  await writeLatestAndReplayIndex({
    repoRoot,
    expDir,
    expId,
    control,
    variant,
  });

  await updateExperimentsIndexRegistry(rootAbs);

  console.log(`Wrote experiment pack: ${path.relative(repoRoot, expDir)}`);
  console.log(`- conditions/${controlId}.json`);
  console.log(`- conditions/${variantId}.json`);
  console.log(`- artifacts/${controlId}/`);
  console.log(`- artifacts/${variantId}/`);
  console.log(`- results/state_diff.md`);
  console.log(`- results/latest.md`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
