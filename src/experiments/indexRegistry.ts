import path from "node:path";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";

type Row = {
  experiment: string;
  title: string;
  ablation: string;
  baseline: string;
  variant: string;
  seeds: string;
  winDelta: string;
  pliesToWinDelta: string;
  avgLatencyDeltaMs: string;
  avgTokensPerTurnDelta: string;
  strictSuboptimalDelta: string;
  decision: string;
  confidence: string;
  controlRerun: string;
  updatedAt: string;
  latestPath: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function fmt(value: number | null, digits = 2): string {
  if (value === null) return "-";
  return value.toFixed(digits);
}

async function loadJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function csv(rows: string[][]): string {
  const esc = (s: string) => {
    if (s.includes(",") || s.includes("\n") || s.includes("\"")) return `"${s.replaceAll("\"", "\"\"")}"`;
    return s;
  };
  return rows.map((r) => r.map((c) => esc(c)).join(",")).join("\n") + "\n";
}

async function collectExperimentRow(params: { rootAbs: string; expId: string }): Promise<Row> {
  const expDir = path.join(params.rootAbs, params.expId);
  const metaPath = path.join(expDir, "experiment.json");
  const comparisonPath = path.join(expDir, "results", "comparison.json");
  const interpretationPath = path.join(expDir, "results", "interpretation.json");
  const latestPathAbs = path.join(expDir, "results", "latest.md");

  const meta = await loadJsonIfExists(metaPath);
  const comparison = await loadJsonIfExists(comparisonPath);
  const interpretation = await loadJsonIfExists(interpretationPath);

  const title = isObject(meta) && typeof meta.title === "string" && meta.title.length > 0 ? meta.title : params.expId;

  const conditionsDir = path.join(expDir, "conditions");
  let conditionIds: string[] = [];
  try {
    const entries = await readdir(conditionsDir, { withFileTypes: true });
    conditionIds = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => e.name.replace(/\.json$/, ""))
      .sort();
  } catch {
    conditionIds = [];
  }
  const baseline = conditionIds.includes("control") ? "control" : (conditionIds[0] ?? "-");
  const variant = conditionIds.find((id) => id !== baseline) ?? (conditionIds.length > 1 ? conditionIds[1]! : "-");

  let seeds = "-";
  let ablation = "-";
  const baselineCondPath = baseline !== "-" ? path.join(conditionsDir, `${baseline}.json`) : "";
  const baselineCond = baselineCondPath ? await loadJsonIfExists(baselineCondPath) : null;
  if (isObject(baselineCond) && isObject(baselineCond.state) && isObject((baselineCond.state as any).matchup)) {
    const seedArr = Array.isArray((baselineCond.state as any).matchup.seeds)
      ? ((baselineCond.state as any).matchup.seeds as unknown[]).filter((x): x is number => typeof x === "number")
      : [];
    if (seedArr.length > 0) seeds = seedArr.join(",");
  }
  if (isObject(baselineCond) && isObject(baselineCond.source) && typeof (baselineCond.source as any).manifestPath === "string") {
    const manifestPath = path.resolve(params.rootAbs, "..", (baselineCond.source as any).manifestPath as string);
    const manifest = await loadJsonIfExists(manifestPath);
    if (isObject(manifest) && isObject(manifest.experiment) && typeof (manifest.experiment as any).ablationKey === "string") {
      ablation = (manifest.experiment as any).ablationKey as string;
    }
  }

  let winDelta: number | null = null;
  let pliesToWinDelta: number | null = null;
  let avgLatencyDeltaMs: number | null = null;
  let avgTokensPerTurnDelta: number | null = null;
  let strictSuboptimalDelta: number | null = null;
  if (isObject(comparison)) {
    const outcomes = isObject(comparison.outcomes) ? comparison.outcomes : {};
    const controlOut = isObject((outcomes as any).control) ? (outcomes as any).control : {};
    const variantOut = isObject((outcomes as any).variant) ? (outcomes as any).variant : {};
    winDelta = (() => {
      const c = toNumber((controlOut as any).wins);
      const v = toNumber((variantOut as any).wins);
      return c === null || v === null ? null : v - c;
    })();
    pliesToWinDelta = (() => {
      const c = isObject((outcomes as any).controlPliesToWin) ? toNumber(((outcomes as any).controlPliesToWin as any).avg) : null;
      const v = isObject((outcomes as any).variantPliesToWin) ? toNumber(((outcomes as any).variantPliesToWin as any).avg) : null;
      return c === null || v === null ? null : v - c;
    })();

    const latency = isObject(comparison.latency) ? comparison.latency : {};
    avgLatencyDeltaMs = (() => {
      const c = isObject((latency as any).control) ? toNumber(((latency as any).control as any).avg) : null;
      const v = isObject((latency as any).variant) ? toNumber(((latency as any).variant as any).avg) : null;
      return c === null || v === null ? null : v - c;
    })();

    const tokenUsage = isObject(comparison.tokenUsage) ? comparison.tokenUsage : {};
    avgTokensPerTurnDelta = (() => {
      const c = toNumber((tokenUsage as any).controlAvgTotalPerTurn);
      const v = toNumber((tokenUsage as any).variantAvgTotalPerTurn);
      return c === null || v === null ? null : v - c;
    })();

    const strictSuboptimal = isObject(comparison.strictSuboptimal) ? comparison.strictSuboptimal : {};
    strictSuboptimalDelta = (() => {
      const cObj = isObject((strictSuboptimal as any).control) ? (strictSuboptimal as any).control : {};
      const vObj = isObject((strictSuboptimal as any).variant) ? (strictSuboptimal as any).variant : {};
      const c = toNumber((cObj as any).strictSuboptimalTurns);
      const v = toNumber((vObj as any).strictSuboptimalTurns);
      return c === null || v === null ? null : v - c;
    })();
  }

  const decision =
    isObject(interpretation) && typeof interpretation.decision === "string" && interpretation.decision.length > 0
      ? interpretation.decision
      : "-";
  const confidence =
    isObject(interpretation) && typeof interpretation.confidence === "string" && interpretation.confidence.length > 0
      ? interpretation.confidence
      : "-";
  const controlRerun =
    isObject(interpretation) && typeof interpretation.controlRerunDue === "boolean"
      ? interpretation.controlRerunDue
        ? "due"
        : "not_due"
      : "-";

  let updatedAt = "";
  try {
    const st = await stat(interpretationPath);
    updatedAt = st.mtime.toISOString();
  } catch {
    try {
      const st = await stat(comparisonPath);
      updatedAt = st.mtime.toISOString();
    } catch {
      try {
        const st = await stat(metaPath);
        updatedAt = st.mtime.toISOString();
      } catch {
        updatedAt = "";
      }
    }
  }

  return {
    experiment: params.expId,
    title,
    ablation,
    baseline,
    variant,
    seeds,
    winDelta: fmt(winDelta, 0),
    pliesToWinDelta: fmt(pliesToWinDelta),
    avgLatencyDeltaMs: fmt(avgLatencyDeltaMs),
    avgTokensPerTurnDelta: fmt(avgTokensPerTurnDelta),
    strictSuboptimalDelta: fmt(strictSuboptimalDelta, 0),
    decision,
    confidence,
    controlRerun,
    updatedAt,
    latestPath: path.relative(params.rootAbs, latestPathAbs),
  };
}

export async function updateExperimentsIndexRegistry(rootAbs: string): Promise<void> {
  const entries = await readdir(rootAbs, { withFileTypes: true });
  const expIds = entries
    .filter((e) => e.isDirectory() && e.name.startsWith("EXP_"))
    .map((e) => e.name)
    .sort((a, b) => b.localeCompare(a));
  const rows: Row[] = [];
  for (const expId of expIds) {
    rows.push(await collectExperimentRow({ rootAbs, expId }));
  }

  const md = [
    "# Experiments Index",
    "",
    "| Experiment | Title | Ablation | Baseline | Variant | Seeds | WinΔ | PliesWinΔ | LatencyΔms | Tokens/TurnΔ | SuboptimalΔ | Decision | Confidence | ControlRerun | Updated (UTC) | Latest |",
    "|---|---|---|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.experiment} | ${r.title} | ${r.ablation} | ${r.baseline} | ${r.variant} | ${r.seeds} | ${r.winDelta} | ${r.pliesToWinDelta} | ${r.avgLatencyDeltaMs} | ${r.avgTokensPerTurnDelta} | ${r.strictSuboptimalDelta} | ${r.decision} | ${r.confidence} | ${r.controlRerun} | ${r.updatedAt || "-"} | \`${r.latestPath}\` |`,
    ),
    "",
  ].join("\n");
  await writeFile(path.join(rootAbs, "INDEX.md"), md, "utf8");

  const csvRows = [
    [
      "experiment",
      "title",
      "ablation",
      "baseline",
      "variant",
      "seeds",
      "win_delta",
      "plies_to_win_delta",
      "avg_latency_ms_delta",
      "avg_tokens_per_turn_delta",
      "strict_suboptimal_delta",
      "decision",
      "confidence",
      "control_rerun",
      "updated_utc",
      "latest_path",
    ],
    ...rows.map((r) => [
      r.experiment,
      r.title,
      r.ablation,
      r.baseline,
      r.variant,
      r.seeds,
      r.winDelta,
      r.pliesToWinDelta,
      r.avgLatencyDeltaMs,
      r.avgTokensPerTurnDelta,
      r.strictSuboptimalDelta,
      r.decision,
      r.confidence,
      r.controlRerun,
      r.updatedAt,
      r.latestPath,
    ]),
  ];
  await writeFile(path.join(rootAbs, "INDEX.csv"), csv(csvRows), "utf8");
}
