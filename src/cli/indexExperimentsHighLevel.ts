import path from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";

type SummaryRow = {
  model?: string;
  opponent?: string;
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  avgProviderErrorTurns?: number;
  avgAgentCaptures?: number;
  avgLatencyMs?: number;
};

type SummaryDoc = {
  createdAt?: string;
  runId?: string;
  experimentId?: string;
  conditionId?: string;
  baselineConditionId?: string;
  seeds?: number[];
  rows?: SummaryRow[];
};

type RunRow = {
  createdAt: string;
  runId: string;
  experimentId: string;
  conditionId: string;
  baselineConditionId: string;
  model: string;
  opponent: string;
  seedsKey: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  avgProviderErrorTurns: number | null;
  avgAgentCaptures: number | null;
  avgLatencyMs: number | null;
  avgPliesWhenWin: number | null;
  avgTokensPerTurn: number | null;
};

type BaselineMatch = {
  row: RunRow;
  kind: "exact_same_experiment" | "exact_global" | "control_alias" | "token_fallback";
};

type ExperimentSummary = {
  experimentId: string;
  runCount: number;
  conditionCount: number;
  conditions: string;
  seeds: string;
  totalGames: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgCaptures: number | null;
  avgProviderErrorTurns: number | null;
  avgLatencyMs: number | null;
  avgPliesPerWin: number | null;
  avgTokensPerTurn: number | null;
  pairedGames: number;
  pairedWinRateDelta: number | null;
  pairedCapturesDelta: number | null;
  pairedProviderErrorDelta: number | null;
  pairedPliesPerWinDelta: number | null;
  pairedLatencyMsDelta: number | null;
  pairedTokensPerTurnDelta: number | null;
  conclusion: string;
  explanation: string;
  latestRun: string;
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

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function asFloat(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function fmt(value: number | null, digits = 3): string {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
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

type DerivedByModel = {
  avgPliesWhenWin: number | null;
  avgLatencyMs: number | null;
  avgTokensPerTurn: number | null;
};

async function loadDerivedMetricsByModel(params: {
  summaryPathAbs: string;
}): Promise<Map<string, DerivedByModel>> {
  const out = new Map<string, DerivedByModel>();
  const baseDir = path.dirname(params.summaryPathAbs);
  const gamePath = path.join(baseDir, "game_metrics.jsonl");
  const turnPath = path.join(baseDir, "turn_metrics.jsonl");

  const roll = new Map<
    string,
    {
      winPliesSum: number;
      winCount: number;
      latencyWeighted: number;
      latencyWeight: number;
      tokenSum: number;
      tokenCount: number;
    }
  >();

  function getKey(model: string, opponent: string): string {
    return `${model}||${opponent}`;
  }

  function ensure(key: string) {
    const cur =
      roll.get(key) ??
      ({
        winPliesSum: 0,
        winCount: 0,
        latencyWeighted: 0,
        latencyWeight: 0,
        tokenSum: 0,
        tokenCount: 0,
      } satisfies (typeof roll extends Map<string, infer V> ? V : never));
    roll.set(key, cur);
    return cur;
  }

  try {
    const gameText = await readFile(gamePath, "utf8");
    for (const line of gameText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: unknown;
      try {
        row = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isObject(row)) continue;
      const model = asString((row as any).model) ?? "-";
      const opponent = asString((row as any).opponent) ?? "-";
      const key = getKey(model, opponent);
      const cur = ensure(key);

      const result = asString((row as any).result);
      const plies = asInt((row as any).plies);
      if (result === "win" && plies !== null) {
        cur.winPliesSum += plies;
        cur.winCount += 1;
      }

      const avgLatencyMs = asFloat((row as any).avgLatencyMs);
      const agentTurns = asInt((row as any).agentTurns);
      if (avgLatencyMs !== null) {
        const w = agentTurns !== null && agentTurns > 0 ? agentTurns : 1;
        cur.latencyWeighted += avgLatencyMs * w;
        cur.latencyWeight += w;
      }
    }
  } catch {
    // optional input; ignore if missing
  }

  try {
    const turnText = await readFile(turnPath, "utf8");
    for (const line of turnText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let row: unknown;
      try {
        row = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (!isObject(row)) continue;
      const model = asString((row as any).model) ?? "-";
      const opponent = asString((row as any).opponent) ?? "-";
      const key = getKey(model, opponent);
      const cur = ensure(key);

      const total = asFloat((row as any).totalTokens);
      const prompt = asFloat((row as any).promptTokens);
      const completion = asFloat((row as any).completionTokens);
      const reasoning = asFloat((row as any).reasoningTokens);
      const tokenTotal =
        total !== null
          ? total
          : prompt !== null || completion !== null || reasoning !== null
            ? (prompt ?? 0) + (completion ?? 0) + (reasoning ?? 0)
            : null;
      if (tokenTotal !== null) {
        cur.tokenSum += tokenTotal;
        cur.tokenCount += 1;
      }
    }
  } catch {
    // optional input; ignore if missing
  }

  for (const [key, cur] of roll.entries()) {
    out.set(key, {
      avgPliesWhenWin: cur.winCount > 0 ? cur.winPliesSum / cur.winCount : null,
      avgLatencyMs: cur.latencyWeight > 0 ? cur.latencyWeighted / cur.latencyWeight : null,
      avgTokensPerTurn: cur.tokenCount > 0 ? cur.tokenSum / cur.tokenCount : null,
    });
  }

  return out;
}

async function parseRunRows(summaryPathAbs: string): Promise<RunRow[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(summaryPathAbs, "utf8"));
  } catch {
    return [];
  }
  if (!isObject(parsed)) return [];
  const doc = parsed as SummaryDoc;

  const experimentId = asString(doc.experimentId);
  const conditionId = asString(doc.conditionId);
  const runId = asString(doc.runId);
  const createdAt = asString(doc.createdAt);
  if (!experimentId || !conditionId || !runId || !createdAt) return [];

  const rows = Array.isArray(doc.rows) ? doc.rows : [];
  if (rows.length === 0) return [];
  const derivedByKey = await loadDerivedMetricsByModel({ summaryPathAbs });

  const baselineConditionId = asString(doc.baselineConditionId) ?? "-";
  const seeds =
    Array.isArray(doc.seeds) && doc.seeds.every((x) => typeof x === "number" && Number.isFinite(x))
      ? (doc.seeds as number[]).map((x) => Math.floor(x))
      : [];
  const seedsKey = seeds.length > 0 ? seeds.join(",") : "-";

  const out: RunRow[] = [];
  for (const row of rows) {
    const model = asString(row.model) ?? "-";
    const opponent = asString(row.opponent) ?? "-";
    const games = asInt(row.games) ?? 0;
    const wins = asInt(row.wins) ?? 0;
    const draws = asInt(row.draws) ?? 0;
    const losses = asInt(row.losses) ?? 0;
    const avgProviderErrorTurns = asFloat(row.avgProviderErrorTurns);
    const avgAgentCaptures = asFloat(row.avgAgentCaptures);
    const derived = derivedByKey.get(`${model}||${opponent}`);
    const avgLatencyMs = asFloat(row.avgLatencyMs) ?? derived?.avgLatencyMs ?? null;
    const avgPliesWhenWin = derived?.avgPliesWhenWin ?? null;
    const avgTokensPerTurn = derived?.avgTokensPerTurn ?? null;
    out.push({
      createdAt,
      runId,
      experimentId,
      conditionId,
      baselineConditionId,
      model,
      opponent,
      seedsKey,
      games,
      wins,
      draws,
      losses,
      avgProviderErrorTurns,
      avgAgentCaptures,
      avgLatencyMs,
      avgPliesWhenWin,
      avgTokensPerTurn,
    });
  }
  return out;
}

function weightedAverage(
  rows: RunRow[],
  key: "avgProviderErrorTurns" | "avgAgentCaptures" | "avgLatencyMs" | "avgPliesWhenWin" | "avgTokensPerTurn",
): number | null {
  let weighted = 0;
  let total = 0;
  for (const r of rows) {
    const value = r[key];
    if (value === null || !Number.isFinite(value)) continue;
    const weight = key === "avgPliesWhenWin" ? r.wins : r.games;
    if (weight <= 0) continue;
    weighted += value * weight;
    total += weight;
  }
  return total > 0 ? weighted / total : null;
}

function parseTs(value: string): number | null {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function parseExpHint(value: string): number | null {
  const m = value.match(/exp[_-]?0*([0-9]{1,4})/i);
  if (!m || !m[1]) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

function expIdMatchesHint(experimentId: string, hint: number): boolean {
  return new RegExp(`^EXP[_-]?0*${hint}\\b`, "i").test(experimentId);
}

function isControlLikeCondition(conditionId: string): boolean {
  const c = conditionId.toLowerCase();
  return c === "control" || c.startsWith("control_") || c.startsWith("control-");
}

function resolveBaseline(variant: RunRow, allRows: RunRow[]): BaselineMatch | null {
  const variantTs = parseTs(variant.createdAt);
  const baselineId = variant.baselineConditionId;
  const candidates = allRows
    .filter((r) => r.model === variant.model && r.opponent === variant.opponent && r.seedsKey === variant.seedsKey)
    .filter((r) => !(r.runId === variant.runId && r.conditionId === variant.conditionId))
    .filter((r) => {
      if (variantTs === null) return true;
      const rt = parseTs(r.createdAt);
      return rt === null || rt <= variantTs;
    });

  const byNewest = (a: RunRow, b: RunRow) => (parseTs(b.createdAt) ?? 0) - (parseTs(a.createdAt) ?? 0);

  const exactSameExperiment = candidates
    .filter((r) => r.experimentId === variant.experimentId && r.conditionId === baselineId)
    .sort(byNewest)[0];
  if (exactSameExperiment) return { row: exactSameExperiment, kind: "exact_same_experiment" };

  const exactGlobal = candidates.filter((r) => r.conditionId === baselineId).sort(byNewest)[0];
  if (exactGlobal) return { row: exactGlobal, kind: "exact_global" };

  const baselineLower = baselineId.toLowerCase();
  if (baselineLower.startsWith("control")) {
    const expHint = parseExpHint(baselineId);
    if (expHint !== null) {
      const hinted = candidates
        .filter((r) => expIdMatchesHint(r.experimentId, expHint))
        .filter((r) => isControlLikeCondition(r.conditionId))
        .sort(byNewest)[0];
      if (hinted) return { row: hinted, kind: "control_alias" };
    }
    const controlAlias = candidates.filter((r) => isControlLikeCondition(r.conditionId)).sort(byNewest)[0];
    if (controlAlias) return { row: controlAlias, kind: "control_alias" };
  }

  const tokens = baselineLower.split(/[^a-z0-9]+/).filter((t) => t.length >= 4);
  if (tokens.length > 0) {
    const tokenFallback = candidates
      .filter((r) => {
        const cond = r.conditionId.toLowerCase();
        const exp = r.experimentId.toLowerCase();
        return tokens.some((t) => cond.includes(t) || exp.includes(t));
      })
      .sort(byNewest)[0];
    if (tokenFallback) return { row: tokenFallback, kind: "token_fallback" };
  }

  return null;
}

function buildExperimentSummary(experimentId: string, rows: RunRow[], allRows: RunRow[]): ExperimentSummary {
  const sorted = rows.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = sorted[0];
  const runCount = new Set(rows.map((r) => r.runId)).size;
  const conditionsList = Array.from(new Set(rows.map((r) => r.conditionId))).sort();
  const conditionCount = conditionsList.length;
  const conditions = conditionsList.join(", ");
  const seedsSet = new Set<string>();
  for (const r of rows) {
    for (const s of r.seedsKey.split(",")) {
      const t = s.trim();
      if (t && t !== "-") seedsSet.add(t);
    }
  }
  const seeds = Array.from(seedsSet).sort((a, b) => Number(a) - Number(b)).join(",");

  const totalGames = rows.reduce((acc, r) => acc + r.games, 0);
  const wins = rows.reduce((acc, r) => acc + r.wins, 0);
  const draws = rows.reduce((acc, r) => acc + r.draws, 0);
  const losses = rows.reduce((acc, r) => acc + r.losses, 0);
  const winRate = totalGames > 0 ? wins / totalGames : 0;
  const avgCaptures = weightedAverage(rows, "avgAgentCaptures");
  const avgProviderErrorTurns = weightedAverage(rows, "avgProviderErrorTurns");
  const avgLatencyMs = weightedAverage(rows, "avgLatencyMs");
  const avgPliesPerWin = weightedAverage(rows, "avgPliesWhenWin");
  const avgTokensPerTurn = weightedAverage(rows, "avgTokensPerTurn");

  const pairable = rows.filter((r) => r.baselineConditionId !== "-" && r.baselineConditionId.length > 0);
  let varGames = 0;
  let varWins = 0;
  let varCapturesWeighted = 0;
  let varProvErrWeighted = 0;
  let baseGames = 0;
  let baseWins = 0;
  let baseCapturesWeighted = 0;
  let baseProvErrWeighted = 0;
  let varPliesWeighted = 0;
  let varPliesWeight = 0;
  let basePliesWeighted = 0;
  let basePliesWeight = 0;
  let varLatencyWeighted = 0;
  let varLatencyWeight = 0;
  let baseLatencyWeighted = 0;
  let baseLatencyWeight = 0;
  let varTokensWeighted = 0;
  let varTokensWeight = 0;
  let baseTokensWeighted = 0;
  let baseTokensWeight = 0;

  let exactMatches = 0;
  let aliasMatches = 0;
  let unresolved = 0;
  for (const variant of pairable) {
    const match = resolveBaseline(variant, allRows);
    if (!match) {
      unresolved += 1;
      continue;
    }
    const baseline = match.row;
    if (match.kind === "exact_same_experiment" || match.kind === "exact_global") exactMatches += 1;
    else aliasMatches += 1;

    varGames += variant.games;
    varWins += variant.wins;
    varCapturesWeighted += (variant.avgAgentCaptures ?? 0) * variant.games;
    varProvErrWeighted += (variant.avgProviderErrorTurns ?? 0) * variant.games;
    if (variant.avgPliesWhenWin !== null && variant.wins > 0) {
      varPliesWeighted += variant.avgPliesWhenWin * variant.wins;
      varPliesWeight += variant.wins;
    }
    if (variant.avgLatencyMs !== null) {
      varLatencyWeighted += variant.avgLatencyMs * variant.games;
      varLatencyWeight += variant.games;
    }
    if (variant.avgTokensPerTurn !== null) {
      varTokensWeighted += variant.avgTokensPerTurn * variant.games;
      varTokensWeight += variant.games;
    }
    baseGames += baseline.games;
    baseWins += baseline.wins;
    baseCapturesWeighted += (baseline.avgAgentCaptures ?? 0) * baseline.games;
    baseProvErrWeighted += (baseline.avgProviderErrorTurns ?? 0) * baseline.games;
    if (baseline.avgPliesWhenWin !== null && baseline.wins > 0) {
      basePliesWeighted += baseline.avgPliesWhenWin * baseline.wins;
      basePliesWeight += baseline.wins;
    }
    if (baseline.avgLatencyMs !== null) {
      baseLatencyWeighted += baseline.avgLatencyMs * baseline.games;
      baseLatencyWeight += baseline.games;
    }
    if (baseline.avgTokensPerTurn !== null) {
      baseTokensWeighted += baseline.avgTokensPerTurn * baseline.games;
      baseTokensWeight += baseline.games;
    }
  }

  const pairedGames = Math.min(varGames, baseGames);
  const pairedWinRateDelta = pairedGames > 0 ? varWins / varGames - baseWins / baseGames : null;
  const pairedCapturesDelta =
    pairedGames > 0 ? varCapturesWeighted / varGames - baseCapturesWeighted / baseGames : null;
  const pairedProviderErrorDelta =
    pairedGames > 0 ? varProvErrWeighted / varGames - baseProvErrWeighted / baseGames : null;
  const pairedPliesPerWinDelta =
    varPliesWeight > 0 && basePliesWeight > 0 ? varPliesWeighted / varPliesWeight - basePliesWeighted / basePliesWeight : null;
  const pairedLatencyMsDelta =
    varLatencyWeight > 0 && baseLatencyWeight > 0
      ? varLatencyWeighted / varLatencyWeight - baseLatencyWeighted / baseLatencyWeight
      : null;
  const pairedTokensPerTurnDelta =
    varTokensWeight > 0 && baseTokensWeight > 0 ? varTokensWeighted / varTokensWeight - baseTokensWeighted / baseTokensWeight : null;

  let conclusion = "inconclusive";
  let explanation = "";
  if (pairedGames === 0) {
    conclusion = "needs_control";
    explanation = "No matched baseline run found for declared baselineConditionId.";
  } else {
    const dWin = pairedWinRateDelta ?? 0;
    const dCap = pairedCapturesDelta ?? 0;
    const dErr = pairedProviderErrorDelta ?? 0;
    const dPlies = pairedPliesPerWinDelta ?? 0;
    // Labeling priority:
    // 1) outcomes (win rate) and reliability (provider errors),
    // 2) speed (plies to win),
    // 3) captures as diagnostic context, not a hard gate.
    if (dWin > 0.10 && dErr <= 0.05) {
      conclusion = "promising";
    } else if (dWin < -0.05 || dErr > 0.10) {
      conclusion = "regression";
    } else if (Math.abs(dWin) <= 0.05 && Math.abs(dErr) <= 0.05 && Math.abs(dPlies) <= 1.0) {
      conclusion = "inconclusive";
    } else {
      conclusion = "mixed";
    }
    explanation = `Paired ${pairedGames} games (exact=${exactMatches}, alias=${aliasMatches}, unresolved=${unresolved}): winΔ=${fmt(dWin, 3)}, providerErrΔ=${fmt(dErr, 3)}, plies/winΔ=${fmt(pairedPliesPerWinDelta, 3)}, capturesΔ=${fmt(dCap, 3)}, latencyΔms=${fmt(pairedLatencyMsDelta, 1)}, tokens/turnΔ=${fmt(pairedTokensPerTurnDelta, 1)}.`;
  }

  return {
    experimentId,
    runCount,
    conditionCount,
    conditions,
    seeds: seeds || "-",
    totalGames,
    wins,
    draws,
    losses,
    winRate,
    avgCaptures,
    avgProviderErrorTurns,
    avgLatencyMs,
    avgPliesPerWin,
    avgTokensPerTurn,
    pairedGames,
    pairedWinRateDelta,
    pairedCapturesDelta,
    pairedProviderErrorDelta,
    pairedPliesPerWinDelta,
    pairedLatencyMsDelta,
    pairedTokensPerTurnDelta,
    conclusion,
    explanation,
    latestRun: latest?.createdAt ?? "-",
  };
}

export async function generateExperimentsHighLevelSummary(params?: {
  repoRoot?: string;
  runsRoot?: string;
  outMd?: string;
  outCsv?: string;
}): Promise<void> {
  const repoRoot = params?.repoRoot ?? process.cwd();
  const runsRoot = params?.runsRoot ?? "runs/experiment_logs";
  const runsRootAbs = path.resolve(repoRoot, runsRoot);
  const outMdAbs = path.resolve(repoRoot, params?.outMd ?? path.join(runsRoot, "EXPERIMENTS_SUMMARY.md"));
  const outCsvAbs = path.resolve(repoRoot, params?.outCsv ?? path.join(runsRoot, "EXPERIMENTS_SUMMARY.csv"));

  const summaryFiles = await collectSummaryFiles(runsRootAbs);
  const rowsNested = await Promise.all(summaryFiles.map((p) => parseRunRows(p)));
  const rows = rowsNested.flat();

  const byExperiment = new Map<string, RunRow[]>();
  for (const row of rows) {
    const arr = byExperiment.get(row.experimentId) ?? [];
    arr.push(row);
    byExperiment.set(row.experimentId, arr);
  }

  const summaries = Array.from(byExperiment.entries())
    .map(([experimentId, expRows]) => buildExperimentSummary(experimentId, expRows, rows))
    .sort((a, b) => Date.parse(b.latestRun) - Date.parse(a.latestRun));

  const md = [
    "# Experiments Summary",
    "",
    "One row per experiment (`experimentId`), aggregated from `runs/experiment_logs/**/summary.json`.",
    "",
    "| Experiment | Runs | Conditions | Seeds | Games | W | D | L | WinRate | AvgCaptures | AvgProvErr | Plies/Win | AvgLatencyMs | AvgTokens/Turn | PairedGames | WinRateΔ | CapturesΔ | ProvErrΔ | Plies/WinΔ | LatencyΔms | TokensΔ/Turn | Conclusion | Why |",
    "|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|",
    ...summaries.map(
      (s) =>
        `| ${s.experimentId} | ${s.runCount} | ${s.conditionCount} (${s.conditions}) | ${s.seeds} | ${s.totalGames} | ${s.wins} | ${s.draws} | ${s.losses} | ${fmt(s.winRate, 3)} | ${fmt(s.avgCaptures, 3)} | ${fmt(s.avgProviderErrorTurns, 3)} | ${fmt(s.avgPliesPerWin, 3)} | ${fmt(s.avgLatencyMs, 1)} | ${fmt(s.avgTokensPerTurn, 1)} | ${s.pairedGames} | ${fmt(s.pairedWinRateDelta, 3)} | ${fmt(s.pairedCapturesDelta, 3)} | ${fmt(s.pairedProviderErrorDelta, 3)} | ${fmt(s.pairedPliesPerWinDelta, 3)} | ${fmt(s.pairedLatencyMsDelta, 1)} | ${fmt(s.pairedTokensPerTurnDelta, 1)} | ${s.conclusion} | ${s.explanation} |`,
    ),
    "",
  ].join("\n");

  const csvRows: string[][] = [
    [
      "experiment_id",
      "run_count",
      "condition_count",
      "conditions",
      "seeds",
      "total_games",
      "wins",
      "draws",
      "losses",
      "win_rate",
      "avg_captures",
      "avg_provider_error_turns",
      "avg_plies_per_win",
      "avg_latency_ms",
      "avg_tokens_per_turn",
      "paired_games",
      "paired_win_rate_delta",
      "paired_captures_delta",
      "paired_provider_error_delta",
      "paired_plies_per_win_delta",
      "paired_latency_ms_delta",
      "paired_tokens_per_turn_delta",
      "conclusion",
      "explanation",
      "latest_run_created_at",
    ],
    ...summaries.map((s) => [
      s.experimentId,
      String(s.runCount),
      String(s.conditionCount),
      s.conditions,
      s.seeds,
      String(s.totalGames),
      String(s.wins),
      String(s.draws),
      String(s.losses),
      fmt(s.winRate, 6),
      fmt(s.avgCaptures, 6),
      fmt(s.avgProviderErrorTurns, 6),
      fmt(s.avgPliesPerWin, 6),
      fmt(s.avgLatencyMs, 6),
      fmt(s.avgTokensPerTurn, 6),
      String(s.pairedGames),
      fmt(s.pairedWinRateDelta, 6),
      fmt(s.pairedCapturesDelta, 6),
      fmt(s.pairedProviderErrorDelta, 6),
      fmt(s.pairedPliesPerWinDelta, 6),
      fmt(s.pairedLatencyMsDelta, 6),
      fmt(s.pairedTokensPerTurnDelta, 6),
      s.conclusion,
      s.explanation,
      s.latestRun,
    ]),
  ];

  await writeFile(outMdAbs, md, "utf8");
  await writeFile(outCsvAbs, csv(csvRows), "utf8");
  console.log(`Wrote: ${path.relative(repoRoot, outMdAbs)}`);
  console.log(`Wrote: ${path.relative(repoRoot, outCsvAbs)}`);
}

async function main() {
  const args = parseArgs(process.argv);
  await generateExperimentsHighLevelSummary({
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
