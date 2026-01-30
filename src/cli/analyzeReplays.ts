import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type PlayerId = "P1" | "P2";

type Replay = {
  seed: number;
  result: { type: "win"; winner: PlayerId } | { type: "draw" };
  players?: Record<PlayerId, { kind: string }>;
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
    if (!val || val.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, val);
      i += 1;
    }
  }
  return args;
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.floor(clamped * (sortedAsc.length - 1));
  return sortedAsc[idx] ?? null;
}

function inferAgentSide(replay: Replay): PlayerId | null {
  const p = replay.players;
  if (!p) return null;
  if (p.P1?.kind === "agent") return "P1";
  if (p.P2?.kind === "agent") return "P2";
  return null;
}

function hasInvalidAction(turn: Replay["turns"][number]): boolean {
  return Array.isArray(turn.events) && turn.events.some((e) => e && e.type === "invalid_action");
}

function isPassTurn(turn: Replay["turns"][number]): boolean {
  const actions = Array.isArray(turn.actions) ? turn.actions : [];
  return actions.length === 0 || actions.every((a) => a && a.type === "pass");
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

type GameMetrics = {
  seed: number;
  agent: PlayerId;
  opponent: PlayerId;
  outcome: "WIN" | "LOSS" | "DRAW";
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

function metricsForReplay(replay: Replay, agentOverride?: PlayerId): GameMetrics {
  const agent = agentOverride ?? inferAgentSide(replay) ?? "P1";
  const opponent: PlayerId = agent === "P1" ? "P2" : "P1";

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
    seed: replay.seed,
    agent,
    opponent,
    outcome,
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
  };
}

type Summary = {
  games: number;
  seeds: number[];
  outcomes: { win: number; loss: number; draw: number };
  rates: {
    passTurnRate: number | null;
    invalidTurnRate: number | null;
    errorTurnRate: number | null;
    fallbackTurnRate: number | null;
  };
  perGame: {
    capturesAvg: number | null;
    timeToFirstCapturePlyAvg: number | null;
    supplyYieldEndAvg: number | null;
    supplyYieldAtPly10Avg: number | null;
  };
  latency: {
    ply0AvgMs: number | null;
    okP50Ms: number | null;
    okP95Ms: number | null;
  };
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

  const passTurnRate = agentTurnsTotal ? passTurnsTotal / agentTurnsTotal : null;
  const invalidTurnRate = agentTurnsTotal ? invalidTurnsTotal / agentTurnsTotal : null;
  const errorTurnRate = agentTurnsTotal ? errorTurnsTotal / agentTurnsTotal : null;
  const fallbackTurnRate = agentTurnsTotal ? fallbackTurnsTotal / agentTurnsTotal : null;

  const capturesAvg = games.length ? games.reduce((s, g) => s + g.captures, 0) / games.length : null;

  const ttf = games.map((g) => g.timeToFirstCapturePly).filter((x): x is number => typeof x === "number");
  const timeToFirstCapturePlyAvg = ttf.length ? ttf.reduce((s, x) => s + x, 0) / ttf.length : null;

  const supplyEnd = games.map((g) => g.supplyYieldEnd).filter((x): x is number => typeof x === "number");
  const supplyYieldEndAvg = supplyEnd.length ? supplyEnd.reduce((s, x) => s + x, 0) / supplyEnd.length : null;

  const supply10 = games.map((g) => g.supplyYieldAtPly10).filter((x): x is number => typeof x === "number");
  const supplyYieldAtPly10Avg = supply10.length ? supply10.reduce((s, x) => s + x, 0) / supply10.length : null;

  const ply0 = games.map((g) => g.ply0LatencyMs).filter((x): x is number => typeof x === "number");
  const ply0AvgMs = ply0.length ? ply0.reduce((s, x) => s + x, 0) / ply0.length : null;

  const okLatAll = games.flatMap((g) => g.okLatenciesMs);
  okLatAll.sort((a, b) => a - b);
  const okP50Ms = percentile(okLatAll, 0.5);
  const okP95Ms = percentile(okLatAll, 0.95);

  return {
    games: games.length,
    seeds: games.map((g) => g.seed).slice().sort((a, b) => a - b),
    outcomes,
    rates: { passTurnRate, invalidTurnRate, errorTurnRate, fallbackTurnRate },
    perGame: { capturesAvg, timeToFirstCapturePlyAvg, supplyYieldEndAvg, supplyYieldAtPly10Avg },
    latency: { ply0AvgMs, okP50Ms, okP95Ms },
  };
}

async function loadDir(dir: string, agentSide?: PlayerId): Promise<{ games: GameMetrics[]; summary: Summary }> {
  const abs = path.resolve(dir);
  const entries = await readdir(abs, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".json"))
    .map((e) => path.join(abs, e.name))
    .sort();

  const games: GameMetrics[] = [];
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const replay = JSON.parse(raw) as Replay;
    games.push(metricsForReplay(replay, agentSide));
  }

  return { games, summary: summarize(games) };
}

async function main() {
  const args = parseArgs(process.argv);
  const dir = args.get("--dir");
  const aDir = args.get("--a");
  const bDir = args.get("--b");
  const agentSideRaw = args.get("--agent-side");
  const agentSide = agentSideRaw === "P1" || agentSideRaw === "P2" ? (agentSideRaw as PlayerId) : undefined;

  if (!dir && !(aDir && bDir)) {
    throw new Error("Usage: --dir <replays_dir> OR --a <dirA> --b <dirB> (optional: --agent-side P1|P2)");
  }

  if (dir) {
    const out = await loadDir(dir, agentSide);
    console.log(JSON.stringify({ dir: path.resolve(dir), summary: out.summary }, null, 2));
    return;
  }

  const a = await loadDir(aDir!, agentSide);
  const b = await loadDir(bDir!, agentSide);

  const bySeedA = new Map(a.games.map((g) => [g.seed, g]));
  const bySeedB = new Map(b.games.map((g) => [g.seed, g]));
  const seeds = Array.from(new Set([...bySeedA.keys(), ...bySeedB.keys()])).sort((x, y) => x - y);

  const paired: Array<{ seed: number; a?: GameMetrics; b?: GameMetrics }> = seeds.map((seed) => ({
    seed,
    a: bySeedA.get(seed),
    b: bySeedB.get(seed),
  }));

  const deltas = paired
    .filter((p) => p.a && p.b)
    .map((p) => {
      const a0 = p.a!;
      const b0 = p.b!;
      const aPass = a0.agentTurns ? a0.passTurns / a0.agentTurns : null;
      const bPass = b0.agentTurns ? b0.passTurns / b0.agentTurns : null;
      const aInv = a0.agentTurns ? a0.invalidTurns / a0.agentTurns : null;
      const bInv = b0.agentTurns ? b0.invalidTurns / b0.agentTurns : null;
      const aErr = a0.agentTurns ? a0.errorTurns / a0.agentTurns : null;
      const bErr = b0.agentTurns ? b0.errorTurns / b0.agentTurns : null;
      return {
        seed: p.seed,
        passTurnRateDelta: aPass !== null && bPass !== null ? bPass - aPass : null,
        invalidTurnRateDelta: aInv !== null && bInv !== null ? bInv - aInv : null,
        errorTurnRateDelta: aErr !== null && bErr !== null ? bErr - aErr : null,
        capturesDelta: b0.captures - a0.captures,
        timeToFirstCaptureDelta:
          typeof a0.timeToFirstCapturePly === "number" && typeof b0.timeToFirstCapturePly === "number"
            ? b0.timeToFirstCapturePly - a0.timeToFirstCapturePly
            : null,
        ply0LatencyDelta:
          typeof a0.ply0LatencyMs === "number" && typeof b0.ply0LatencyMs === "number" ? b0.ply0LatencyMs - a0.ply0LatencyMs : null,
      };
    });

  console.log(
    JSON.stringify(
      {
        a: { dir: path.resolve(aDir!), summary: a.summary },
        b: { dir: path.resolve(bDir!), summary: b.summary },
        pairedDeltas: deltas,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

