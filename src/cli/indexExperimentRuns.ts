import path from "node:path";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";

type SummaryRow = {
  provider?: string;
  model?: string;
  opponent?: string;
  plannedGames?: number;
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  winRate?: number;
  avgProviderErrorTurns?: number;
  avgAgentCaptures?: number;
  captureRate?: number;
};

type SummaryDoc = {
  runId?: string;
  createdAt?: string;
  experimentId?: string;
  conditionId?: string;
  baselineConditionId?: string;
  ablationKey?: string;
  hypothesis?: string;
  notes?: string;
  seeds?: number[];
  plannedGames?: number;
  provider?: string;
  opponent?: string;
  reasoningEffort?: string;
  rationaleStyle?: string;
  replaysDir?: string;
  rows?: SummaryRow[];
};

type RunIndexRow = {
  createdAt: string;
  runId: string;
  experimentId: string;
  conditionId: string;
  baselineConditionId: string;
  ablationKey: string;
  provider: string;
  model: string;
  opponent: string;
  seeds: string;
  plannedGames: string;
  games: string;
  wins: string;
  draws: string;
  losses: string;
  winRate: string;
  avgProviderErrorTurns: string;
  avgAgentCaptures: string;
  captureRate: string;
  reasoningEffort: string;
  rationaleStyle: string;
  replaysDir: string;
  summaryPath: string;
  hypothesis: string;
  notes: string;
};

function parseArgs(argv: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key || !key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      out.set(key, "true");
      continue;
    }
    out.set(key, value);
    i += 1;
  }
  return out;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown, fallback = "-"): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function asInt(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.floor(value)) : "-";
}

function asFloat(value: unknown, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function csv(rows: string[][]): string {
  const esc = (s: string) => {
    if (s.includes(",") || s.includes("\n") || s.includes("\"")) return `"${s.replaceAll("\"", "\"\"")}"`;
    return s;
  };
  return rows.map((r) => r.map((c) => esc(c)).join(",")).join("\n") + "\n";
}

async function collectSummaryFiles(rootAbs: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [rootAbs];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(abs);
        continue;
      }
      if (e.isFile() && e.name === "summary.json") out.push(abs);
    }
  }
  return out;
}

async function parseSummaryAsRows(params: {
  summaryPathAbs: string;
  runsRootAbs: string;
}): Promise<RunIndexRow[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(params.summaryPathAbs, "utf8"));
  } catch {
    return [];
  }
  if (!isObject(parsed)) return [];

  const doc = parsed as SummaryDoc;
  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (rows.length === 0) return [];

  const seeds =
    Array.isArray(doc.seeds) && doc.seeds.every((x) => typeof x === "number" && Number.isFinite(x))
      ? (doc.seeds as number[]).map((x) => Math.floor(x)).join(",")
      : "-";

  const createdAt = asString(doc.createdAt);
  const runId = asString(doc.runId);
  const experimentId = asString(doc.experimentId);
  const conditionId = asString(doc.conditionId);
  const baselineConditionId = asString(doc.baselineConditionId);
  const ablationKey = asString(doc.ablationKey);
  const reasoningEffort = asString(doc.reasoningEffort);
  const rationaleStyle = asString(doc.rationaleStyle);
  const replaysDir = asString(doc.replaysDir);
  const hypothesis = asString(doc.hypothesis);
  const notes = asString(doc.notes);
  const summaryPath = path.relative(params.runsRootAbs, params.summaryPathAbs);

  return rows.map((r) => ({
    createdAt,
    runId,
    experimentId,
    conditionId,
    baselineConditionId,
    ablationKey,
    provider: asString(r.provider ?? doc.provider),
    model: asString(r.model),
    opponent: asString(r.opponent ?? doc.opponent),
    seeds,
    plannedGames: asInt(r.plannedGames ?? doc.plannedGames),
    games: asInt(r.games),
    wins: asInt(r.wins),
    draws: asInt(r.draws),
    losses: asInt(r.losses),
    winRate: asFloat(r.winRate, 3),
    avgProviderErrorTurns: asFloat(r.avgProviderErrorTurns, 3),
    avgAgentCaptures: asFloat(r.avgAgentCaptures, 3),
    captureRate: asFloat(r.captureRate, 3),
    reasoningEffort,
    rationaleStyle,
    replaysDir,
    summaryPath,
    hypothesis,
    notes,
  }));
}

export async function generateExperimentRunsIndex(params?: {
  repoRoot?: string;
  runsRoot?: string;
  outMd?: string;
  outCsv?: string;
}): Promise<void> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const runsRoot = params?.runsRoot ?? "runs/experiment_logs";
  const runsRootAbs = path.resolve(repoRoot, runsRoot);
  const outMdAbs = path.resolve(repoRoot, params?.outMd ?? path.join(runsRoot, "INDEX.md"));
  const outCsvAbs = path.resolve(repoRoot, params?.outCsv ?? path.join(runsRoot, "INDEX.csv"));

  const summaryFiles = await collectSummaryFiles(runsRootAbs);
  const rowsNested = await Promise.all(summaryFiles.map((summaryPathAbs) => parseSummaryAsRows({ summaryPathAbs, runsRootAbs })));
  const rows = rowsNested.flat();

  rows.sort((a, b) => {
    const at = Date.parse(a.createdAt);
    const bt = Date.parse(b.createdAt);
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return bt - at;
    if (a.runId !== b.runId) return b.runId.localeCompare(a.runId);
    if (a.conditionId !== b.conditionId) return a.conditionId.localeCompare(b.conditionId);
    return a.model.localeCompare(b.model);
  });

  const md = [
    "# Experiment Runs Index",
    "",
    "Source of truth for executed runs under `runs/experiment_logs/**/summary.json`.",
    "",
    "| Created (local) | Experiment | Condition | Baseline | Model | Opponent | Seeds | W | D | L | WinRate | AvgCaptures | AvgProvErr | CaptureRate | Effort | Rationale | Summary |",
    "|---|---|---|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.createdAt} | ${r.experimentId} | ${r.conditionId} | ${r.baselineConditionId} | ${r.model} | ${r.opponent} | ${r.seeds} | ${r.wins} | ${r.draws} | ${r.losses} | ${r.winRate} | ${r.avgAgentCaptures} | ${r.avgProviderErrorTurns} | ${r.captureRate} | ${r.reasoningEffort} | ${r.rationaleStyle} | \`${r.summaryPath}\` |`,
    ),
    "",
  ].join("\n");

  const csvRows: string[][] = [
    [
      "created_at",
      "run_id",
      "experiment_id",
      "condition_id",
      "baseline_condition_id",
      "ablation_key",
      "provider",
      "model",
      "opponent",
      "seeds",
      "planned_games",
      "games",
      "wins",
      "draws",
      "losses",
      "win_rate",
      "avg_provider_error_turns",
      "avg_agent_captures",
      "capture_rate",
      "reasoning_effort",
      "rationale_style",
      "replays_dir",
      "summary_path",
      "hypothesis",
      "notes",
    ],
    ...rows.map((r) => [
      r.createdAt,
      r.runId,
      r.experimentId,
      r.conditionId,
      r.baselineConditionId,
      r.ablationKey,
      r.provider,
      r.model,
      r.opponent,
      r.seeds,
      r.plannedGames,
      r.games,
      r.wins,
      r.draws,
      r.losses,
      r.winRate,
      r.avgProviderErrorTurns,
      r.avgAgentCaptures,
      r.captureRate,
      r.reasoningEffort,
      r.rationaleStyle,
      r.replaysDir,
      r.summaryPath,
      r.hypothesis,
      r.notes,
    ]),
  ];

  await writeFile(outMdAbs, md, "utf8");
  await writeFile(outCsvAbs, csv(csvRows), "utf8");

  console.log(`Indexed ${rows.length} run rows from ${summaryFiles.length} summary files.`);
  console.log(`Wrote: ${path.relative(repoRoot, outMdAbs)}`);
  console.log(`Wrote: ${path.relative(repoRoot, outCsvAbs)}`);
}

async function main() {
  const args = parseArgs(process.argv);
  await generateExperimentRunsIndex({
    repoRoot: process.cwd(),
    runsRoot: args.get("--runs-dir") ?? undefined,
    outMd: args.get("--out-md") ?? undefined,
    outCsv: args.get("--out-csv") ?? undefined,
  });
}

main().catch((err) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
