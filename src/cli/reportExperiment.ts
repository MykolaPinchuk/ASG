import path from "node:path";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { pacificIsoString } from "../utils/pacificTime.js";
import { isControlRerunDue, loadExperimentPolicy } from "../experiments/policy.js";
import { updateExperimentsIndexRegistry } from "../experiments/indexRegistry.js";

type JsonRow = Record<string, unknown>;

type ConditionDoc = {
  conditionId: string;
  links?: {
    gameMetricsPath?: string;
    turnMetricsPath?: string;
  };
  source?: {
    manifestPath?: string;
  };
};

type UsageTotals = {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  rowsWithUsage: number;
  rowsWithoutUsage: number;
};

type SuboptimalStats = {
  agentTurns: number;
  turnsWithReinforceCapacity: number;
  strictSuboptimalTurns: number;
  missedReinforceStrengthTotal: number;
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

function mustArg(args: Map<string, string>, key: string): string {
  const v = args.get(key);
  if (!v) throw new Error(`missing required ${key}`);
  return v;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function loadJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonl(filePath: string | undefined): Promise<JsonRow[]> {
  if (!filePath) return [];
  try {
    const text = await readFile(filePath, "utf8");
    const rows: JsonRow[] = [];
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

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.floor(Math.max(0, Math.min(1, p)) * (sortedAsc.length - 1));
  return sortedAsc[idx] ?? null;
}

function summarizeNumbers(xs: number[]): { count: number; avg: number | null; p50: number | null; p95: number | null } {
  const vals = xs.filter((x) => Number.isFinite(x));
  vals.sort((a, b) => a - b);
  if (vals.length === 0) return { count: 0, avg: null, p50: null, p95: null };
  const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
  return { count: vals.length, avg, p50: percentile(vals, 0.5), p95: percentile(vals, 0.95) };
}

async function readCondition(repoRoot: string, expId: string, conditionId: string): Promise<ConditionDoc> {
  const file = path.join(repoRoot, "experiments", expId, "conditions", `${conditionId}.json`);
  const parsed = await loadJson(file);
  if (!isObject(parsed)) throw new Error(`invalid condition file: ${file}`);
  return parsed as ConditionDoc;
}

function parseReplayIndexCsv(text: string): Array<{ condition: string; seed: number; result: string; replayPath: string }> {
  const rows: Array<{ condition: string; seed: number; result: string; replayPath: string }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    rows.push({
      condition: parts[0] ?? "",
      seed: Number.parseInt(parts[1] ?? "", 10),
      result: parts[2] ?? "",
      replayPath: parts.slice(3).join(","),
    });
  }
  return rows;
}

async function computeSuboptimalStats(params: {
  repoRoot: string;
  replayPaths: string[];
}): Promise<SuboptimalStats> {
  const out: SuboptimalStats = {
    agentTurns: 0,
    turnsWithReinforceCapacity: 0,
    strictSuboptimalTurns: 0,
    missedReinforceStrengthTotal: 0,
  };

  for (const rel of params.replayPaths) {
    const file = path.resolve(params.repoRoot, rel);
    let replay: unknown;
    try {
      replay = await loadJson(file);
    } catch {
      continue;
    }
    if (!isObject(replay)) continue;

    const scenario = isObject(replay.scenario) ? replay.scenario : {};
    const settings = isObject((scenario as any).settings) ? (scenario as any).settings : {};
    const baseIncome = toNumber((settings as any).baseIncome) ?? 0;
    const reinforceCost = toNumber((settings as any).reinforceCostPerStrength) ?? 1;
    if (reinforceCost <= 0) continue;

    const turns = Array.isArray((replay as any).turns) ? ((replay as any).turns as unknown[]) : [];
    for (const turnAny of turns) {
      if (!isObject(turnAny)) continue;
      if ((turnAny as any).player !== "P1") continue;
      out.agentTurns += 1;

      const observations = isObject((turnAny as any).observations) ? (turnAny as any).observations : {};
      const obsP1 = isObject(observations.P1) ? observations.P1 : null;
      if (!obsP1) continue;

      const supplies = isObject((obsP1 as any).supplies) ? (obsP1 as any).supplies : {};
      const supplyBefore = toNumber((supplies as any).P1) ?? 0;
      const nodes = isObject((obsP1 as any).nodes) ? (obsP1 as any).nodes : {};

      let income = baseIncome;
      for (const nodeAny of Object.values(nodes)) {
        if (!isObject(nodeAny)) continue;
        if ((nodeAny as any).owner !== "P1") continue;
        income += toNumber((nodeAny as any).supplyYield) ?? 0;
      }

      const supplyAfterIncome = Math.max(0, supplyBefore + income);
      const maxReinforce = Math.max(0, Math.floor(supplyAfterIncome / reinforceCost));
      if (maxReinforce > 0) out.turnsWithReinforceCapacity += 1;

      const events = Array.isArray((turnAny as any).events) ? ((turnAny as any).events as unknown[]) : [];
      let reinforcedApplied = 0;
      for (const e of events) {
        if (!isObject(e)) continue;
        if ((e as any).type !== "reinforce") continue;
        if ((e as any).player !== "P1") continue;
        reinforcedApplied += toNumber((e as any).amount) ?? 0;
      }

      if (maxReinforce > reinforcedApplied) {
        out.strictSuboptimalTurns += 1;
        out.missedReinforceStrengthTotal += maxReinforce - reinforcedApplied;
      }
    }
  }

  return out;
}

function extractUsageFromRaw(raw: unknown): { prompt: number; completion: number; reasoning: number; total: number } | null {
  if (!isObject(raw)) return null;
  const body = (raw as any).body;
  if (typeof body !== "string" || body.length === 0) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const usage = isObject(parsed?.usage) ? parsed.usage : null;
  if (!usage) return null;

  const prompt =
    toNumber((usage as any).prompt_tokens) ??
    toNumber((usage as any).input_tokens) ??
    toNumber((usage as any).promptTokens) ??
    0;
  const completion =
    toNumber((usage as any).completion_tokens) ??
    toNumber((usage as any).output_tokens) ??
    toNumber((usage as any).completionTokens) ??
    0;

  let reasoning =
    toNumber((usage as any).reasoning_tokens) ??
    toNumber((usage as any).reasoningTokens) ??
    0;
  if (reasoning === 0 && isObject((usage as any).output_tokens_details)) {
    reasoning = toNumber(((usage as any).output_tokens_details as any).reasoning_tokens) ?? 0;
  }

  const total =
    toNumber((usage as any).total_tokens) ??
    toNumber((usage as any).totalTokens) ??
    (prompt + completion);

  return { prompt, completion, reasoning, total };
}

async function listJsonFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
        continue;
      }
      if (e.isFile() && e.name.endsWith(".json")) out.push(full);
    }
  }
  await walk(root);
  return out;
}

async function readUsageTotalsFromServerLogs(dirPath: string | undefined): Promise<UsageTotals | null> {
  if (!dirPath) return null;
  const files = await listJsonFilesRecursive(dirPath);
  if (files.length === 0) return null;

  const totals: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    rowsWithUsage: 0,
    rowsWithoutUsage: 0,
  };

  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = await loadJson(file);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    const response = isObject((parsed as any).response) ? (parsed as any).response : {};
    const upstreamRaw = (response as any).upstreamRaw;
    const usage = extractUsageFromRaw(upstreamRaw);
    if (!usage) {
      totals.rowsWithoutUsage += 1;
      continue;
    }
    totals.rowsWithUsage += 1;
    totals.promptTokens += usage.prompt;
    totals.completionTokens += usage.completion;
    totals.reasoningTokens += usage.reasoning;
    totals.totalTokens += usage.total;
  }

  return totals;
}

function formatNum(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function formatPct(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${(value * 100).toFixed(1)}%`;
}

function classifyDecision(params: {
  winDelta: number;
  pliesToWinDelta: number | null;
  avgLatencyDelta: number | null;
  strictSuboptimalDelta: number;
}) {
  let score = 0;
  if (params.winDelta > 0) score += 3;
  if (params.winDelta < 0) score -= 4;
  if (params.pliesToWinDelta !== null && params.pliesToWinDelta <= -1) score += 1;
  if (params.pliesToWinDelta !== null && params.pliesToWinDelta >= 1) score -= 1;
  if (params.avgLatencyDelta !== null && params.avgLatencyDelta <= -200) score += 1;
  if (params.avgLatencyDelta !== null && params.avgLatencyDelta >= 200) score -= 1;
  if (params.strictSuboptimalDelta > 0) score -= 2;
  if (params.strictSuboptimalDelta < 0) score += 1;

  if (score >= 2) return "promising";
  if (score <= -2) return "regression";
  return "inconclusive";
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();
  const expId = mustArg(args, "--exp-id");
  const controlId = args.get("--control-id") ?? "control";
  const variantId = args.get("--variant-id") ?? "variant";

  const expDir = path.join(repoRoot, "experiments", expId);
  const resultsDir = path.join(expDir, "results");
  await mkdir(resultsDir, { recursive: true });

  const control = await readCondition(repoRoot, expId, controlId);
  const variant = await readCondition(repoRoot, expId, variantId);

  const controlGames = await readJsonl(control.links?.gameMetricsPath ? path.resolve(repoRoot, control.links.gameMetricsPath) : undefined);
  const variantGames = await readJsonl(variant.links?.gameMetricsPath ? path.resolve(repoRoot, variant.links.gameMetricsPath) : undefined);
  const controlTurns = await readJsonl(control.links?.turnMetricsPath ? path.resolve(repoRoot, control.links.turnMetricsPath) : undefined);
  const variantTurns = await readJsonl(variant.links?.turnMetricsPath ? path.resolve(repoRoot, variant.links.turnMetricsPath) : undefined);

  const countResults = (rows: JsonRow[]) => {
    let wins = 0;
    let draws = 0;
    let losses = 0;
    const pliesToWin: number[] = [];
    for (const row of rows) {
      const result = String(row.result ?? "");
      if (result === "win") wins += 1;
      else if (result === "draw") draws += 1;
      else if (result === "loss") losses += 1;
      if (result === "win") {
        const p = toNumber(row.plies);
        if (p !== null) pliesToWin.push(p);
      }
    }
    return { games: rows.length, wins, draws, losses, pliesToWin };
  };

  const controlRes = countResults(controlGames);
  const variantRes = countResults(variantGames);

  const controlLatency = summarizeNumbers(controlTurns.map((r) => toNumber(r.latencyMs)).filter((x): x is number => x !== null));
  const variantLatency = summarizeNumbers(variantTurns.map((r) => toNumber(r.latencyMs)).filter((x): x is number => x !== null));

  const replayIndexPath = path.join(resultsDir, "replay_index.csv");
  const replayIndexText = await readFile(replayIndexPath, "utf8");
  const replayRows = parseReplayIndexCsv(replayIndexText);
  const controlReplays = replayRows.filter((r) => r.condition === controlId).map((r) => r.replayPath);
  const variantReplays = replayRows.filter((r) => r.condition === variantId).map((r) => r.replayPath);

  const controlSubopt = await computeSuboptimalStats({ repoRoot, replayPaths: controlReplays });
  const variantSubopt = await computeSuboptimalStats({ repoRoot, replayPaths: variantReplays });

  const controlManifestPath = control.source?.manifestPath ? path.resolve(repoRoot, control.source.manifestPath) : undefined;
  const variantManifestPath = variant.source?.manifestPath ? path.resolve(repoRoot, variant.source.manifestPath) : undefined;
  const controlManifest = controlManifestPath ? await loadJson(controlManifestPath) : null;
  const variantManifest = variantManifestPath ? await loadJson(variantManifestPath) : null;

  const controlServerLogDir =
    args.get("--control-server-log-dir") ??
    (isObject(controlManifest) && isObject((controlManifest as any).outputs) ? ((controlManifest as any).outputs as any).serverLogDir : undefined);
  const variantServerLogDir =
    args.get("--variant-server-log-dir") ??
    (isObject(variantManifest) && isObject((variantManifest as any).outputs) ? ((variantManifest as any).outputs as any).serverLogDir : undefined);

  const controlUsage = await readUsageTotalsFromServerLogs(controlServerLogDir ? path.resolve(repoRoot, String(controlServerLogDir)) : undefined);
  const variantUsage = await readUsageTotalsFromServerLogs(variantServerLogDir ? path.resolve(repoRoot, String(variantServerLogDir)) : undefined);
  const { policy: experimentPolicy } = await loadExperimentPolicy(repoRoot);

  const controlPliesWin = summarizeNumbers(controlRes.pliesToWin);
  const variantPliesWin = summarizeNumbers(variantRes.pliesToWin);

  const controlSuboptRate =
    controlSubopt.turnsWithReinforceCapacity > 0 ? controlSubopt.strictSuboptimalTurns / controlSubopt.turnsWithReinforceCapacity : null;
  const variantSuboptRate =
    variantSubopt.turnsWithReinforceCapacity > 0 ? variantSubopt.strictSuboptimalTurns / variantSubopt.turnsWithReinforceCapacity : null;

  const controlUsagePerTurn = controlUsage && controlTurns.length > 0 ? controlUsage.totalTokens / controlTurns.length : null;
  const variantUsagePerTurn = variantUsage && variantTurns.length > 0 ? variantUsage.totalTokens / variantTurns.length : null;

  const delta = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : b - a);

  const outMd = path.join(resultsDir, "comparison.md");
  const lines = [
    `# ${expId} - Comparison`,
    "",
    `Generated: ${pacificIsoString()}`,
    `Control: \`${controlId}\`  Variant: \`${variantId}\``,
    "",
    "## Outcomes",
    "",
    "| Metric | Control | Variant | Delta (Variant-Control) |",
    "|---|---:|---:|---:|",
    `| Games | ${controlRes.games} | ${variantRes.games} | ${variantRes.games - controlRes.games} |`,
    `| Wins | ${controlRes.wins} | ${variantRes.wins} | ${variantRes.wins - controlRes.wins} |`,
    `| Draws | ${controlRes.draws} | ${variantRes.draws} | ${variantRes.draws - controlRes.draws} |`,
    `| Losses | ${controlRes.losses} | ${variantRes.losses} | ${variantRes.losses - controlRes.losses} |`,
    `| Avg plies to win | ${formatNum(controlPliesWin.avg)} | ${formatNum(variantPliesWin.avg)} | ${formatNum(delta(controlPliesWin.avg, variantPliesWin.avg))} |`,
    "",
    "## Latency (agent turns)",
    "",
    "| Metric | Control | Variant | Delta |",
    "|---|---:|---:|---:|",
    `| Turn count | ${controlLatency.count} | ${variantLatency.count} | ${variantLatency.count - controlLatency.count} |`,
    `| Avg latency ms | ${formatNum(controlLatency.avg)} | ${formatNum(variantLatency.avg)} | ${formatNum(delta(controlLatency.avg, variantLatency.avg))} |`,
    `| P50 latency ms | ${formatNum(controlLatency.p50)} | ${formatNum(variantLatency.p50)} | ${formatNum(delta(controlLatency.p50, variantLatency.p50))} |`,
    `| P95 latency ms | ${formatNum(controlLatency.p95)} | ${formatNum(variantLatency.p95)} | ${formatNum(delta(controlLatency.p95, variantLatency.p95))} |`,
    "",
    "## Token usage",
    "",
    "| Metric | Control | Variant | Delta |",
    "|---|---:|---:|---:|",
    `| Usage rows found | ${controlUsage?.rowsWithUsage ?? 0} | ${variantUsage?.rowsWithUsage ?? 0} | ${(variantUsage?.rowsWithUsage ?? 0) - (controlUsage?.rowsWithUsage ?? 0)} |`,
    `| Total prompt tokens | ${controlUsage?.promptTokens ?? "n/a"} | ${variantUsage?.promptTokens ?? "n/a"} | ${controlUsage && variantUsage ? variantUsage.promptTokens - controlUsage.promptTokens : "n/a"} |`,
    `| Total completion tokens | ${controlUsage?.completionTokens ?? "n/a"} | ${variantUsage?.completionTokens ?? "n/a"} | ${controlUsage && variantUsage ? variantUsage.completionTokens - controlUsage.completionTokens : "n/a"} |`,
    `| Total reasoning tokens | ${controlUsage?.reasoningTokens ?? "n/a"} | ${variantUsage?.reasoningTokens ?? "n/a"} | ${controlUsage && variantUsage ? variantUsage.reasoningTokens - controlUsage.reasoningTokens : "n/a"} |`,
    `| Total tokens | ${controlUsage?.totalTokens ?? "n/a"} | ${variantUsage?.totalTokens ?? "n/a"} | ${controlUsage && variantUsage ? variantUsage.totalTokens - controlUsage.totalTokens : "n/a"} |`,
    `| Avg total tokens / turn | ${formatNum(controlUsagePerTurn)} | ${formatNum(variantUsagePerTurn)} | ${formatNum(delta(controlUsagePerTurn, variantUsagePerTurn))} |`,
    "",
    "## Strict suboptimal reinforce behavior",
    "Definition: on a P1 turn, if max affordable reinforce at turn start (after income) > actually applied reinforce amount that turn.",
    "",
    "| Metric | Control | Variant | Delta |",
    "|---|---:|---:|---:|",
    `| Agent turns | ${controlSubopt.agentTurns} | ${variantSubopt.agentTurns} | ${variantSubopt.agentTurns - controlSubopt.agentTurns} |`,
    `| Turns with reinforce capacity | ${controlSubopt.turnsWithReinforceCapacity} | ${variantSubopt.turnsWithReinforceCapacity} | ${variantSubopt.turnsWithReinforceCapacity - controlSubopt.turnsWithReinforceCapacity} |`,
    `| Strict suboptimal turns | ${controlSubopt.strictSuboptimalTurns} | ${variantSubopt.strictSuboptimalTurns} | ${variantSubopt.strictSuboptimalTurns - controlSubopt.strictSuboptimalTurns} |`,
    `| Strict suboptimal rate | ${formatPct(controlSuboptRate)} | ${formatPct(variantSuboptRate)} | ${formatPct(delta(controlSuboptRate, variantSuboptRate))} |`,
    `| Missed reinforce strength total | ${controlSubopt.missedReinforceStrengthTotal} | ${variantSubopt.missedReinforceStrengthTotal} | ${variantSubopt.missedReinforceStrengthTotal - controlSubopt.missedReinforceStrengthTotal} |`,
    "",
    "## Sources",
    `- Control state: \`experiments/${expId}/conditions/${controlId}.json\``,
    `- Variant state: \`experiments/${expId}/conditions/${variantId}.json\``,
    `- Replay index: \`experiments/${expId}/results/replay_index.csv\``,
    `- Control run manifest: \`${control.source?.manifestPath ?? "n/a"}\``,
    `- Variant run manifest: \`${variant.source?.manifestPath ?? "n/a"}\``,
    "",
  ];

  await writeFile(outMd, lines.join("\n"), "utf8");

  const outJson = path.join(resultsDir, "comparison.json");
  const payload = {
    generatedAt: pacificIsoString(),
    experimentId: expId,
    controlId,
    variantId,
    outcomes: {
      control: controlRes,
      variant: variantRes,
      controlPliesToWin: controlPliesWin,
      variantPliesToWin: variantPliesWin,
    },
    latency: {
      control: controlLatency,
      variant: variantLatency,
    },
    tokenUsage: {
      control: controlUsage,
      variant: variantUsage,
      controlAvgTotalPerTurn: controlUsagePerTurn,
      variantAvgTotalPerTurn: variantUsagePerTurn,
    },
    strictSuboptimal: {
      control: controlSubopt,
      variant: variantSubopt,
      controlRate: controlSuboptRate,
      variantRate: variantSuboptRate,
    },
  };
  await writeFile(outJson, JSON.stringify(payload, null, 2) + "\n", "utf8");

  const winDelta = variantRes.wins - controlRes.wins;
  const strictSuboptimalDelta = variantSubopt.strictSuboptimalTurns - controlSubopt.strictSuboptimalTurns;
  const decision = classifyDecision({
    winDelta,
    pliesToWinDelta: delta(controlPliesWin.avg, variantPliesWin.avg),
    avgLatencyDelta: delta(controlLatency.avg, variantLatency.avg),
    strictSuboptimalDelta,
  });
  const totalGames = Math.min(controlRes.games, variantRes.games);
  const confidence = totalGames >= 10 ? "high" : totalGames >= 5 ? "medium" : "low";
  const controlRerunDue = isControlRerunDue(expId, experimentPolicy.controlRerunEveryVariants);

  const interpretation = {
    generatedAt: pacificIsoString(),
    experimentId: expId,
    controlId,
    variantId,
    decision,
    confidence,
    controlRerunEveryVariants: experimentPolicy.controlRerunEveryVariants,
    controlRerunDue,
    summary: {
      winsDelta: winDelta,
      pliesToWinDelta: delta(controlPliesWin.avg, variantPliesWin.avg),
      avgLatencyMsDelta: delta(controlLatency.avg, variantLatency.avg),
      avgTokensPerTurnDelta: delta(controlUsagePerTurn, variantUsagePerTurn),
      strictSuboptimalTurnsDelta: strictSuboptimalDelta,
    },
  };
  const interpretationJsonPath = path.join(resultsDir, "interpretation.json");
  await writeFile(interpretationJsonPath, JSON.stringify(interpretation, null, 2) + "\n", "utf8");

  const interpretationMdPath = path.join(resultsDir, "interpretation.md");
  const md = [
    `# ${expId} - Interpretation`,
    "",
    `Generated: ${interpretation.generatedAt}`,
    "",
    `- Decision: **${decision}**`,
    `- Confidence: **${confidence}**`,
    `- Control rerun cadence: every ${experimentPolicy.controlRerunEveryVariants} variant experiments`,
    `- Control rerun due now: **${controlRerunDue ? "yes" : "no"}**`,
    "",
    "## Signals",
    `- Wins delta (variant-control): ${winDelta}`,
    `- Avg plies-to-win delta: ${formatNum(interpretation.summary.pliesToWinDelta)}`,
    `- Avg latency delta ms: ${formatNum(interpretation.summary.avgLatencyMsDelta)}`,
    `- Avg tokens/turn delta: ${formatNum(interpretation.summary.avgTokensPerTurnDelta)}`,
    `- Strict suboptimal turns delta: ${strictSuboptimalDelta}`,
    "",
    "## Rule of thumb",
    "- `promising`: no reliability regressions and at least one meaningful improvement signal.",
    "- `inconclusive`: mixed or small movement; run a larger seed set before deciding.",
    "- `regression`: reliability or outcome deterioration outweighs gains.",
    "",
  ].join("\n");
  await writeFile(interpretationMdPath, md, "utf8");

  // Keep latest.md as the short entry point and link to comparison.
  const latestPath = path.join(resultsDir, "latest.md");
  try {
    const latest = await readFile(latestPath, "utf8");
    const marker = "## Notes";
    const comparisonBlock = [
      "## Comparison",
      "- `experiments/<this-exp>/results/comparison.md`",
      "- `experiments/<this-exp>/results/interpretation.md`",
      "",
    ].join("\n");
    let updated = latest;
    const needsComparisonBlock = !updated.includes("results/comparison.md") || !updated.includes("results/interpretation.md");
    if (needsComparisonBlock) {
      if (updated.includes("## Comparison")) {
        updated = updated.replace(/## Comparison[\s\S]*?(?=\n## |\n$)/, `${comparisonBlock}\n`);
      } else if (updated.includes(marker)) {
        updated = updated.replace(marker, `${comparisonBlock}\n${marker}`);
      } else {
        updated = `${updated.trim()}\n\n${comparisonBlock}\n`;
      }
    }
    await writeFile(latestPath, updated, "utf8");
  } catch {
    // ignore
  }

  await updateExperimentsIndexRegistry(path.join(repoRoot, "experiments"));

  console.log(`Wrote: ${path.relative(repoRoot, outMd)}`);
  console.log(`Wrote: ${path.relative(repoRoot, outJson)}`);
  console.log(`Wrote: ${path.relative(repoRoot, interpretationMdPath)}`);
  console.log(`Wrote: ${path.relative(repoRoot, interpretationJsonPath)}`);
  console.log(`Updated: experiments/INDEX.md`);
  console.log(`Updated: experiments/INDEX.csv`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
