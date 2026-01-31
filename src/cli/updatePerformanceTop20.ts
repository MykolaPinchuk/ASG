import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";

type PlayerId = "P1" | "P2";

type Replay = {
  seed: number;
  result: { type: "win"; winner: PlayerId } | { type: "draw" };
  scenario?: { settings?: { turnCapPlies?: number } };
  players?: Record<
    PlayerId,
    | { kind: "agent"; provider?: string; model?: string }
    | { kind: "mix" }
    | { kind: "greedy" }
    | { kind: "random" }
    | { kind: string }
  >;
  turns: Array<{
    ply: number;
    player: PlayerId;
    actions: Array<{ type: string }>;
    latencyMs?: number;
    diagnostics?: {
      error?: string;
      upstreamError?: string;
      upstreamStatus?: number;
      usedFallback?: boolean;
    };
    events?: Array<{ type: string }>;
    stateAfter?: {
      nodes?: Record<string, { owner?: string; supplyYield?: number }>;
    };
  }>;
};

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) args.set(key, "true");
    else {
      args.set(key, val);
      i += 1;
    }
  }
  return args;
}

function fmtPct(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(0)}%`;
}

function fmtNum(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "—";
  return String(Math.round(x));
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.floor(clamped * (sortedAsc.length - 1));
  return sortedAsc[idx] ?? null;
}

function isErrorTurn(turn: Replay["turns"][number]): boolean {
  const d = turn.diagnostics;
  if (!d) return false;
  if (typeof d.error === "string" && d.error) return true;
  if (typeof d.upstreamError === "string" && d.upstreamError) return true;
  if (typeof d.upstreamStatus === "number" && Number.isFinite(d.upstreamStatus) && d.upstreamStatus >= 400) return true;
  return false;
}

function isFallbackTurn(turn: Replay["turns"][number]): boolean {
  const d = turn.diagnostics;
  return !!(d && d.usedFallback === true);
}

function isPassTurn(turn: Replay["turns"][number]): boolean {
  const actions = Array.isArray(turn.actions) ? turn.actions : [];
  return actions.length === 0 || actions.every((a) => a && a.type === "pass");
}

function hasInvalidAction(turn: Replay["turns"][number]): boolean {
  return Array.isArray(turn.events) && turn.events.some((e) => e && e.type === "invalid_action");
}

function supplyYieldOwned(stateAfter: Replay["turns"][number]["stateAfter"], player: PlayerId): number | null {
  const nodes = stateAfter?.nodes;
  if (!nodes) return null;
  let sum = 0;
  for (const node of Object.values(nodes)) {
    if (node?.owner !== player) continue;
    const y = node?.supplyYield;
    if (typeof y === "number" && Number.isFinite(y)) sum += y;
  }
  return sum;
}

function inferAgentSide(replay: Replay): PlayerId | null {
  const p = replay.players;
  if (!p) return null;
  if (p.P1?.kind === "agent") return "P1";
  if (p.P2?.kind === "agent") return "P2";
  return null;
}

function inferOpponentKind(replay: Replay, agent: PlayerId): string | null {
  const p = replay.players;
  if (!p) return null;
  const opp: PlayerId = agent === "P1" ? "P2" : "P1";
  const k = (p[opp] as any)?.kind;
  return typeof k === "string" ? k : null;
}

type GameMetrics = {
  seed: number;
  outcome: "WIN" | "LOSS" | "DRAW";
  pliesTotal: number;
  agentTurns: number;
  passTurns: number;
  invalidTurns: number;
  errorTurns: number;
  fallbackTurns: number;
  captures: number;
  timeToFirstCapturePly: number | null;
  supplyYieldEnd: number | null;
  supplyYieldAtPly10: number | null;
  ply0LatencyMs: number | null;
  okLatenciesMs: number[];
};

function metricsForReplay(replay: Replay, agentOverride?: PlayerId): { agent: PlayerId; provider: string | null; model: string | null; opponentKind: string | null; metrics: GameMetrics } | null {
  const agent = agentOverride ?? inferAgentSide(replay) ?? null;
  if (!agent) return null;
  const p = replay.players?.[agent] as any;
  const provider = typeof p?.provider === "string" ? p.provider : null;
  const model = typeof p?.model === "string" ? p.model : null;
  const opponentKind = inferOpponentKind(replay, agent);

  const agentTurns = replay.turns.filter((t) => t.player === agent);
  const passTurns = agentTurns.filter(isPassTurn).length;
  const invalidTurns = agentTurns.filter(hasInvalidAction).length;
  const errorTurns = agentTurns.filter(isErrorTurn).length;
  const fallbackTurns = agentTurns.filter(isFallbackTurn).length;

  let captures = 0;
  let timeToFirstCapturePly: number | null = null;
  for (const t of agentTurns) {
    const c = Array.isArray(t.events) ? t.events.filter((e) => e && e.type === "capture").length : 0;
    if (c > 0 && timeToFirstCapturePly === null) timeToFirstCapturePly = t.ply;
    captures += c;
  }

  const lastState = replay.turns.length ? replay.turns[replay.turns.length - 1]!.stateAfter : undefined;
  const supplyYieldEnd = supplyYieldOwned(lastState, agent);
  const ply10 = replay.turns.find((t) => t.ply === 10)?.stateAfter;
  const supplyYieldAtPly10 = supplyYieldOwned(ply10, agent);

  const firstAgentTurn = agentTurns.slice().sort((a, b) => a.ply - b.ply)[0];
  const ply0LatencyMs =
    firstAgentTurn && typeof firstAgentTurn.latencyMs === "number" && Number.isFinite(firstAgentTurn.latencyMs)
      ? Math.floor(firstAgentTurn.latencyMs)
      : null;

  const okLatenciesMs = agentTurns
    .filter((t) => !isErrorTurn(t))
    .map((t) => (typeof t.latencyMs === "number" && Number.isFinite(t.latencyMs) ? Math.floor(t.latencyMs) : null))
    .filter((x): x is number => typeof x === "number");

  let outcome: GameMetrics["outcome"] = "DRAW";
  if (replay.result.type === "draw") outcome = "DRAW";
  else if (replay.result.winner === agent) outcome = "WIN";
  else outcome = "LOSS";

  return {
    agent,
    provider,
    model,
    opponentKind,
    metrics: {
      seed: replay.seed,
      outcome,
      pliesTotal: Array.isArray(replay.turns) ? replay.turns.length : 0,
      agentTurns: agentTurns.length,
      passTurns,
      invalidTurns,
      errorTurns,
      fallbackTurns,
      captures,
      timeToFirstCapturePly,
      supplyYieldEnd,
      supplyYieldAtPly10,
      ply0LatencyMs,
      okLatenciesMs,
    },
  };
}

type Summary = {
  games: number;
  outcomes: { win: number; loss: number; draw: number };
  rates: {
    passTurnRate: number | null;
    invalidTurnRate: number | null;
    errorTurnRate: number | null;
    fallbackTurnRate: number | null;
    okTurnRate: number | null;
  };
  perGame: {
    capturesAvg: number | null;
    timeToFirstCapturePlyAvg: number | null;
    supplyYieldEndAvg: number | null;
    supplyYieldAtPly10Avg: number | null;
    winPliesAvg: number | null;
  };
  latency: {
    ply0AvgMs: number | null;
    okAvgMs: number | null;
    okP50Ms: number | null;
    okP95Ms: number | null;
  };
  seeds: Array<{ seed: number; outcome: "WIN" | "LOSS" | "DRAW" }>;
};

function summarize(games: GameMetrics[]): Summary {
  const outcomes = { win: 0, loss: 0, draw: 0 };
  for (const g of games) {
    if (g.outcome === "WIN") outcomes.win += 1;
    else if (g.outcome === "LOSS") outcomes.loss += 1;
    else outcomes.draw += 1;
  }

  const agentTurnsTotal = games.reduce((s, g) => s + g.agentTurns, 0);
  const passTurnsTotal = games.reduce((s, g) => s + g.passTurns, 0);
  const invalidTurnsTotal = games.reduce((s, g) => s + g.invalidTurns, 0);
  const errorTurnsTotal = games.reduce((s, g) => s + g.errorTurns, 0);
  const fallbackTurnsTotal = games.reduce((s, g) => s + g.fallbackTurns, 0);
  const okTurnsTotal = games.reduce((s, g) => s + (g.agentTurns - g.errorTurns), 0);

  const passTurnRate = agentTurnsTotal ? passTurnsTotal / agentTurnsTotal : null;
  const invalidTurnRate = agentTurnsTotal ? invalidTurnsTotal / agentTurnsTotal : null;
  const errorTurnRate = agentTurnsTotal ? errorTurnsTotal / agentTurnsTotal : null;
  const fallbackTurnRate = agentTurnsTotal ? fallbackTurnsTotal / agentTurnsTotal : null;
  const okTurnRate = agentTurnsTotal ? okTurnsTotal / agentTurnsTotal : null;

  const capturesAvg = games.length ? games.reduce((s, g) => s + g.captures, 0) / games.length : null;

  const ttf = games.map((g) => g.timeToFirstCapturePly).filter((x): x is number => typeof x === "number");
  const timeToFirstCapturePlyAvg = ttf.length ? ttf.reduce((s, x) => s + x, 0) / ttf.length : null;

  const supplyEnd = games.map((g) => g.supplyYieldEnd).filter((x): x is number => typeof x === "number");
  const supplyYieldEndAvg = supplyEnd.length ? supplyEnd.reduce((s, x) => s + x, 0) / supplyEnd.length : null;

  const supply10 = games.map((g) => g.supplyYieldAtPly10).filter((x): x is number => typeof x === "number");
  const supplyYieldAtPly10Avg = supply10.length ? supply10.reduce((s, x) => s + x, 0) / supply10.length : null;

  const winPlies = games
    .filter((g) => g.outcome === "WIN")
    .map((g) => g.pliesTotal)
    .filter((x) => Number.isFinite(x) && x > 0);
  const winPliesAvg = winPlies.length ? winPlies.reduce((s, x) => s + x, 0) / winPlies.length : null;

  const ply0 = games.map((g) => g.ply0LatencyMs).filter((x): x is number => typeof x === "number");
  const ply0AvgMs = ply0.length ? ply0.reduce((s, x) => s + x, 0) / ply0.length : null;

  const okLatAll = games.flatMap((g) => g.okLatenciesMs);
  okLatAll.sort((a, b) => a - b);
  const okAvgMs = okLatAll.length ? okLatAll.reduce((s, x) => s + x, 0) / okLatAll.length : null;
  const okP50Ms = percentile(okLatAll, 0.5);
  const okP95Ms = percentile(okLatAll, 0.95);

  const seeds = games
    .map((g) => ({ seed: g.seed, outcome: g.outcome }))
    .slice()
    .sort((a, b) => a.seed - b.seed);

  return {
    games: games.length,
    outcomes,
    rates: { passTurnRate, invalidTurnRate, errorTurnRate, fallbackTurnRate, okTurnRate },
    perGame: { capturesAvg, timeToFirstCapturePlyAvg, supplyYieldEndAvg, supplyYieldAtPly10Avg, winPliesAvg },
    latency: { ply0AvgMs, okAvgMs, okP50Ms, okP95Ms },
    seeds,
  };
}

type FocusEntry = { provider: string; model: string; config: string; why: string };

function parseFocus20(text: string): FocusEntry[] {
  const lines = text.split(/\r?\n/);
  const rows: FocusEntry[] = [];
  let inTable = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("| provider | model | config | why |")) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (line.startsWith("|---")) continue;
    if (!line.startsWith("|")) break;
    const parts = line
      .split("|")
      .slice(1, -1)
      .map((s) => s.trim());
    if (parts.length < 4) continue;
    const [provider, model, config, why] = parts;
    if (!provider || !model) continue;
    rows.push({ provider, model, config, why });
  }
  return rows;
}

async function collectReplayJsonPaths(params: { roots: string[]; maxFiles: number }): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();

  const enqueueIfNew = (p: string) => {
    const abs = path.resolve(p);
    if (seen.has(abs)) return false;
    seen.add(abs);
    return true;
  };

  const walk = async (dir: string, mode: "normal" | "runs"): Promise<void> => {
    if (out.length >= params.maxFiles) return;
    let entries: Dirent[];
    try {
      // Force string Dirent names for TS/Node compat.
      entries = (await readdir(dir, { withFileTypes: true, encoding: "utf8" })) as unknown as Dirent[];
    } catch {
      return;
    }

    for (const ent of entries) {
      if (out.length >= params.maxFiles) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (mode === "runs") {
          if (ent.name === "replays") {
            await walk(full, "normal");
            continue;
          }
          await walk(full, "runs");
          continue;
        }
        await walk(full, "normal");
        continue;
      }
      if (!ent.isFile()) continue;
      if (!ent.name.toLowerCase().endsWith(".json")) continue;
      if (!enqueueIfNew(full)) continue;
      out.push(path.resolve(full));
    }
  };

  for (const r of params.roots) {
    if (out.length >= params.maxFiles) break;
    const abs = path.resolve(r);
    try {
      const st = await stat(abs);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    if (path.basename(abs) === "runs") await walk(abs, "runs");
    else await walk(abs, "normal");
  }

  return out;
}

function fmtWdl(o: Summary["outcomes"]): string {
  return `${o.win}-${o.draw}-${o.loss}`;
}

function winRate(summary: Summary): number | null {
  if (summary.games === 0) return null;
  return summary.outcomes.win / summary.games;
}

function fmtSeeds(seeds: Summary["seeds"]): string {
  if (seeds.length === 0) return "—";
  const parts = seeds.slice(0, 20).map((s) => `${s.seed}:${s.outcome[0]}`);
  return seeds.length > 20 ? `${parts.join(", ")} …` : parts.join(", ");
}

function nowPacificStamp(): string {
  // Stable enough; avoids depending on system TZ config and keeps humans oriented.
  const d = new Date();
  const stamp = d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return stamp.replace(",", "");
}

async function loadPinnedLeaderboard(filePath: string): Promise<Array<{ provider: string; model: string }> | null> {
  try {
    const text = await readFile(filePath, "utf8");
    const rows: Array<{ provider: string; model: string }> = [];
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length < 2) continue;
      const provider = parts[0] ?? "";
      const model = parts[1] ?? "";
      if (!provider || !model) continue;
      rows.push({ provider, model });
    }
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const focusFile = args.get("--focus-file") ?? "docs/focus20_models.md";
  const outFile = args.get("--out") ?? "performance.md";
  const leaderboardFile = args.get("--leaderboard-file") ?? "configs/leaderboard_top6_models.txt";
  const roots = (args.get("--roots") ?? "replays,runs").split(",").map((s) => s.trim()).filter(Boolean);
  const maxPlies = Number.parseInt(args.get("--max-plies") ?? "30", 10);
  const maxFiles = Number.parseInt(args.get("--max-files") ?? "20000", 10);

  const focusText = await readFile(focusFile, "utf8");
  const focus = parseFocus20(focusText);
  if (focus.length === 0) throw new Error(`No focus entries parsed from ${focusFile}`);

  const replayPaths = await collectReplayJsonPaths({ roots, maxFiles });

  const byKey: Map<string, { entry: FocusEntry; mix: { games: GameMetrics[]; sources: Set<string> }; greedy: { games: GameMetrics[]; sources: Set<string> } }> =
    new Map();
  for (const e of focus) {
    const key = `${e.provider}||${e.model}||${e.config}`;
    byKey.set(key, { entry: e, mix: { games: [], sources: new Set() }, greedy: { games: [], sources: new Set() } });
  }

  let parsed = 0;
  let considered = 0;

  for (const file of replayPaths) {
    considered += 1;
    let raw: string;
    try {
      raw = await readFile(file, "utf8");
    } catch {
      continue;
    }
    let replay: Replay;
    try {
      replay = JSON.parse(raw) as Replay;
    } catch {
      continue;
    }
    if (!replay || !Array.isArray((replay as any).turns) || !(replay as any).result) continue;
    if (typeof replay.seed !== "number" || !Number.isFinite(replay.seed)) continue;
    if (replay.turns.length > maxPlies) continue;
    parsed += 1;

    const info = metricsForReplay(replay);
    if (!info) continue;
    if (!info.provider || !info.model) continue;
    const opponentKind = info.opponentKind;
    if (opponentKind !== "mix" && opponentKind !== "greedy") continue;

    const maybeKeys: string[] = [];
    for (const e of focus) {
      if (e.provider !== info.provider) continue;
      if (e.model !== info.model) continue;
      maybeKeys.push(`${e.provider}||${e.model}||${e.config}`);
    }
    if (maybeKeys.length === 0) continue;

    // We cannot reliably attribute per-run config (reasoning-effort/tools/etc) from the replay today.
    // If the focus file contains multiple rows for the same provider+model with different config labels,
    // attribute the replay to the first matching row to avoid double-counting.
    const key = maybeKeys[0]!;
    const bucket = byKey.get(key);
    if (!bucket) continue;

    const sourceDir = path.dirname(file);
    if (opponentKind === "mix") {
      bucket.mix.games.push(info.metrics);
      bucket.mix.sources.add(sourceDir);
    } else {
      bucket.greedy.games.push(info.metrics);
      bucket.greedy.sources.add(sourceDir);
    }
  }

  const updatedAt = nowPacificStamp();
  const lines: string[] = [];
  lines.push("# Performance (Focus-20 models)");
  lines.push("");
  lines.push(`Updated (Pacific): ${updatedAt}`);
  lines.push("");
  lines.push("This file is generated from saved replay JSONs. It summarizes Focus-20 model performance under v0/v0.x guardrails (plies <= 30).");
  lines.push("");
  lines.push("## How to update");
  lines.push("");
  lines.push("```bash");
  lines.push("npm run -s perf:top20");
  lines.push("```");
  lines.push("");
  lines.push("## Data coverage");
  lines.push("");
  lines.push(`- Focus list: \`${focusFile}\` (${focus.length} entries)`);
  lines.push(`- Replay roots scanned: ${roots.map((r) => `\`${r}\``).join(", ")}`);
  lines.push(`- JSON files considered: ${considered}`);
  lines.push(`- Replays parsed (plies <= ${maxPlies}): ${parsed}`);
  lines.push("");
  lines.push("## Caveats");
  lines.push("");
  lines.push("- Replays currently do not persist full run config (e.g. `reasoning-effort`, `tools-mode`, `max-tokens`).");
  lines.push("- If Focus-20 contains multiple rows for the same provider+model with different config labels, metrics cannot be split reliably yet; this generator avoids double-counting by attributing replays to the first matching row.");
  lines.push("");

  lines.push("## Summary (vs MixBot, plies <= 30)");
  lines.push("");
  lines.push("| provider | model | games | W-D-L | win | avg ok latency (ms) | avg plies to win | ok turns | pass | invalid | error | fallback | captures/game |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");

  for (const { entry, mix } of byKey.values()) {
    const s = summarize(mix.games);
    const win = winRate(s);
    lines.push(
      `| ${entry.provider} | ${entry.model} | ${s.games} | ${fmtWdl(s.outcomes)} | ${fmtPct(win)} | ${fmtNum(s.latency.okAvgMs)} | ${fmtNum(s.perGame.winPliesAvg)} | ${fmtPct(s.rates.okTurnRate)} | ${fmtPct(s.rates.passTurnRate)} | ${fmtPct(s.rates.invalidTurnRate)} | ${fmtPct(s.rates.errorTurnRate)} | ${fmtPct(s.rates.fallbackTurnRate)} | ${fmtNum(s.perGame.capturesAvg)} |`,
    );
  }
  lines.push("");

  type LeaderRow = {
    entry: FocusEntry;
    summary: Summary;
  };
  const leaderRows: LeaderRow[] = [];
  for (const { entry, mix } of byKey.values()) leaderRows.push({ entry, summary: summarize(mix.games) });

  const pinned = await loadPinnedLeaderboard(leaderboardFile);
  let top6: LeaderRow[] = [];
  if (pinned) {
    for (const p of pinned) {
      const found =
        leaderRows.find((r) => r.entry.provider === p.provider && r.entry.model === p.model) ??
        leaderRows.find((r) => r.entry.provider.toLowerCase() === p.provider.toLowerCase() && r.entry.model.toLowerCase() === p.model.toLowerCase()) ??
        null;
      if (found) top6.push(found);
    }
    // If pinned list is shorter than 6 (or some rows missing), backfill with best remaining.
    if (top6.length < 6) {
      const already = new Set(top6.map((r) => `${r.entry.provider}||${r.entry.model}`.toLowerCase()));
      const sorted = leaderRows
        .filter((r) => !already.has(`${r.entry.provider}||${r.entry.model}`.toLowerCase()))
        .slice()
        .sort((a, b) => {
          const aw = winRate(a.summary) ?? -1;
          const bw = winRate(b.summary) ?? -1;
          return (
            bw - aw ||
            b.summary.games - a.summary.games ||
            (a.summary.latency.okAvgMs ?? 1e12) - (b.summary.latency.okAvgMs ?? 1e12) ||
            a.entry.model.localeCompare(b.entry.model)
          );
        });
      top6 = [...top6, ...sorted.slice(0, 6 - top6.length)];
    }
    top6 = top6.slice(0, 6);
  } else {
    const sorted = leaderRows
      .slice()
      .sort((a, b) => {
        const aw = winRate(a.summary) ?? -1;
        const bw = winRate(b.summary) ?? -1;
        return (
          bw - aw ||
          b.summary.games - a.summary.games ||
          (a.summary.latency.okAvgMs ?? 1e12) - (b.summary.latency.okAvgMs ?? 1e12) ||
          a.entry.model.localeCompare(b.entry.model)
        );
      });
    top6 = sorted.slice(0, 6);
  }

  lines.push(`## Leaderboard (Top 6, vs MixBot)`);
  lines.push("");
  lines.push("| rank | provider | model | config | games | W-D-L | win | avg ok latency (ms) | avg plies to win | ok turns |");
  lines.push("|---:|---|---|---|---:|---:|---:|---:|---:|---:|");
  for (let i = 0; i < top6.length; i++) {
    const r = top6[i]!;
    const s = r.summary;
    lines.push(
      `| ${i + 1} | ${r.entry.provider} | ${r.entry.model} | ${r.entry.config || ""} | ${s.games} | ${fmtWdl(s.outcomes)} | ${fmtPct(
        winRate(s),
      )} | ${fmtNum(s.latency.okAvgMs)} | ${fmtNum(s.perGame.winPliesAvg)} | ${fmtPct(s.rates.okTurnRate)} |`,
    );
  }
  lines.push("");

  lines.push("## Details (Focus-20 order)");
  lines.push("");

  for (const e of focus) {
    const key = `${e.provider}||${e.model}||${e.config}`;
    const bucket = byKey.get(key);
    if (!bucket) continue;
    const mixS = summarize(bucket.mix.games);
    const greedyS = summarize(bucket.greedy.games);
    const mixWin = winRate(mixS);
    const greedyWin = winRate(greedyS);

    lines.push(`### ${e.provider} / ${e.model}${e.config ? ` (${e.config})` : ""}`);
    lines.push("");
    if (e.why) lines.push(`- Focus: ${e.why}`);
    lines.push(
      `- MixBot: games=${mixS.games} W-D-L=${fmtWdl(mixS.outcomes)} win=${fmtPct(mixWin)} avgOkLatencyMs=${fmtNum(mixS.latency.okAvgMs)} avgPliesToWin=${fmtNum(
        mixS.perGame.winPliesAvg,
      )} okTurns=${fmtPct(mixS.rates.okTurnRate)} p50/p95OkLatencyMs=${fmtNum(mixS.latency.okP50Ms)}/${fmtNum(mixS.latency.okP95Ms)}`,
    );
    lines.push(`  - pass=${fmtPct(mixS.rates.passTurnRate)} invalid=${fmtPct(mixS.rates.invalidTurnRate)} error=${fmtPct(mixS.rates.errorTurnRate)} fallback=${fmtPct(mixS.rates.fallbackTurnRate)}`);
    lines.push(`  - captures/game=${fmtNum(mixS.perGame.capturesAvg)} ttfCaptureAvgPly=${fmtNum(mixS.perGame.timeToFirstCapturePlyAvg)} supplyYield@10=${fmtNum(mixS.perGame.supplyYieldAtPly10Avg)} supplyYieldEnd=${fmtNum(mixS.perGame.supplyYieldEndAvg)}`);
    lines.push(`  - seeds(outcome): ${fmtSeeds(mixS.seeds)}`);
    if (bucket.mix.sources.size > 0) lines.push(`  - sources: ${Array.from(bucket.mix.sources).slice(0, 6).map((s) => `\`${path.relative(process.cwd(), s)}\``).join(", ")}${bucket.mix.sources.size > 6 ? ", …" : ""}`);
    lines.push(
      `- GreedyBot: games=${greedyS.games} W-D-L=${fmtWdl(greedyS.outcomes)} win=${fmtPct(greedyWin)} avgOkLatencyMs=${fmtNum(greedyS.latency.okAvgMs)} avgPliesToWin=${fmtNum(
        greedyS.perGame.winPliesAvg,
      )} okTurns=${fmtPct(greedyS.rates.okTurnRate)} p50/p95OkLatencyMs=${fmtNum(greedyS.latency.okP50Ms)}/${fmtNum(greedyS.latency.okP95Ms)}`,
    );
    lines.push(`  - pass=${fmtPct(greedyS.rates.passTurnRate)} invalid=${fmtPct(greedyS.rates.invalidTurnRate)} error=${fmtPct(greedyS.rates.errorTurnRate)} fallback=${fmtPct(greedyS.rates.fallbackTurnRate)}`);
    lines.push(`  - captures/game=${fmtNum(greedyS.perGame.capturesAvg)} ttfCaptureAvgPly=${fmtNum(greedyS.perGame.timeToFirstCapturePlyAvg)} supplyYield@10=${fmtNum(greedyS.perGame.supplyYieldAtPly10Avg)} supplyYieldEnd=${fmtNum(greedyS.perGame.supplyYieldEndAvg)}`);
    lines.push(`  - seeds(outcome): ${fmtSeeds(greedyS.seeds)}`);
    if (bucket.greedy.sources.size > 0) lines.push(`  - sources: ${Array.from(bucket.greedy.sources).slice(0, 6).map((s) => `\`${path.relative(process.cwd(), s)}\``).join(", ")}${bucket.greedy.sources.size > 6 ? ", …" : ""}`);
    lines.push("");
  }

  await writeFile(outFile, lines.join("\n"), "utf8");
  console.log(`Wrote: ${outFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
