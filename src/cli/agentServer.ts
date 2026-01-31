import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { applyTurn } from "../game/engine.js";
import { PRNG } from "../game/prng.js";

type PlayerId = "P1" | "P2";

type AgentRequest = {
  api_version: string;
  match_id: string;
  player: PlayerId;
  scenario_id: string;
  ply: number;
  action_budget: number;
  observation: any;
};

type Action =
  | { type: "pass" }
  | { type: "reinforce"; amount: number }
  | { type: "move"; from: string; to: string; amount: number };

type AgentResponse = {
  api_version: string;
  actions: Action[];
  rationale_text?: string;
  memory_update?: string;
  agent_info?: {
    provider?: string;
    baseUrl?: string;
    model?: string;
    modelMode?: "auto" | "explicit";
  };
  server_diagnostics?: {
    provider: Provider;
    upstreamStatus?: number;
    upstreamError?: string;
    usedFallback?: boolean;
  };
};

type Scenario = {
  id: string;
  settings: {
    actionBudget: number;
    baseIncome?: number;
    reinforceCostPerStrength: number;
    combatVarianceFraction?: number;
    turnCapPlies?: number;
  };
  players: Record<PlayerId, { hq: string }>;
  map: { nodes: { id: string; supplyYield: number }[]; edges: [string, string][] };
};

type Provider = "stub" | "openai_compat";

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function otherPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

function isAction(value: unknown): value is Action {
  if (!isObject(value)) return false;
  const type = value.type;
  if (type === "pass") return true;
  if (type === "reinforce") return typeof value.amount === "number" && Number.isFinite(value.amount);
  if (type === "move") {
    return (
      typeof value.from === "string" &&
      value.from.length > 0 &&
      typeof value.to === "string" &&
      value.to.length > 0 &&
      typeof value.amount === "number" &&
      Number.isFinite(value.amount)
    );
  }
  return false;
}

function clampInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function sumIncomeFromObservation(obs: any, player: PlayerId, baseIncome: number): number {
  let income = baseIncome;
  const nodes: Record<string, any> = obs?.nodes ?? {};
  for (const node of Object.values(nodes)) {
    if (node?.owner === player) income += Number.isFinite(node?.supplyYield) ? Number(node.supplyYield) : 0;
  }
  return income;
}

function hasAnyLegalNonPassAction(req: AgentRequest, scenario: Scenario, adjacency: Record<string, string[]>): boolean {
  const obs: any = req.observation ?? {};
  const supplies: Record<PlayerId, number> = obs.supplies ?? { P1: 0, P2: 0 };
  const baseIncome = scenario.settings?.baseIncome ?? 0;
  const income = sumIncomeFromObservation(obs, req.player, baseIncome);
  const effectiveSupply = (Number.isFinite(supplies[req.player]) ? supplies[req.player] : 0) + income;
  const cost = scenario.settings?.reinforceCostPerStrength ?? 1;
  if (effectiveSupply >= cost) return true;

  const nodes: Record<string, any> = obs.nodes ?? {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[req.player];
    if (!Number.isFinite(f) || f <= 0) continue;
    if ((adjacency[nodeId] ?? []).length > 0) return true;
  }

  return false;
}

function sanitizeActionsAgainstObservation(params: {
  actions: unknown;
  budget: number;
  req: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
  fallbackMode: "pass" | "stub";
}): {
  actions: Action[];
  usedFallback: boolean;
  issues: Array<
    | { kind: "drop"; index: number; reason: string; action?: unknown }
    | { kind: "clamp"; index: number; reason: string; from?: unknown; to?: unknown }
    | { kind: "normalize"; index: number; reason: string; from?: unknown; to?: unknown }
  >;
} {
  const { req, scenario, adjacency } = params;
  const budget = Math.max(0, params.budget);
  const obs: any = req.observation ?? {};
  const nodes: Record<string, any> = obs.nodes ?? {};
  const nodeIdByLower = new Map<string, string>();
  for (const id of Object.keys(nodes)) nodeIdByLower.set(id.toLowerCase(), id);
  const forcesRemaining: Record<string, number> = {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[req.player];
    forcesRemaining[nodeId] = Number.isFinite(f) ? Math.max(0, Math.floor(f)) : 0;
  }

  const supplies: Record<PlayerId, number> = obs.supplies ?? { P1: 0, P2: 0 };
  const baseIncome = scenario.settings?.baseIncome ?? 0;
  const income = sumIncomeFromObservation(obs, req.player, baseIncome);
  let supplyRemaining = (Number.isFinite(supplies[req.player]) ? supplies[req.player] : 0) + income;
  const cost = scenario.settings?.reinforceCostPerStrength ?? 1;

  const raw = Array.isArray(params.actions) ? params.actions : [];
  const out: Action[] = [];
  const issues: Array<
    | { kind: "drop"; index: number; reason: string; action?: unknown }
    | { kind: "clamp"; index: number; reason: string; from?: unknown; to?: unknown }
    | { kind: "normalize"; index: number; reason: string; from?: unknown; to?: unknown }
  > = [];

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (out.length >= budget) break;
    if (!isAction(a)) {
      issues.push({ kind: "drop", index: i, reason: "invalid action shape", action: a });
      continue;
    }

    if (a.type === "pass") continue;

    if (a.type === "reinforce") {
      const amt0 = clampInt((a as any).amount);
      if (amt0 === null) {
        issues.push({ kind: "drop", index: i, reason: "reinforce.amount is not a number", action: a });
        continue;
      }
      const amt = Math.max(1, amt0);
      const maxAffordable = Math.floor(supplyRemaining / cost);
      if (maxAffordable < 1) {
        issues.push({ kind: "drop", index: i, reason: "insufficient supply for reinforce", action: a });
        continue;
      }
      const finalAmt = Math.min(amt, maxAffordable);
      if (finalAmt !== amt) {
        issues.push({
          kind: "clamp",
          index: i,
          reason: "reinforce amount clamped to affordable",
          from: a,
          to: { type: "reinforce", amount: finalAmt },
        });
      }
      out.push({ type: "reinforce", amount: finalAmt });
      supplyRemaining -= finalAmt * cost;
      continue;
    }

    if (a.type === "move") {
      const fromRaw = (a as any).from;
      const toRaw = (a as any).to;
      if (typeof fromRaw !== "string" || typeof toRaw !== "string") {
        issues.push({ kind: "drop", index: i, reason: "move.from/move.to must be strings", action: a });
        continue;
      }
      const fromTrimmed = fromRaw.trim();
      const toTrimmed = toRaw.trim();
      const from = nodeIdByLower.get(fromTrimmed.toLowerCase()) ?? fromTrimmed;
      const to = nodeIdByLower.get(toTrimmed.toLowerCase()) ?? toTrimmed;
      if (from !== fromTrimmed || to !== toTrimmed) {
        issues.push({
          kind: "normalize",
          index: i,
          reason: "normalized node ids (trim/case)",
          from: { type: "move", from: fromRaw, to: toRaw, amount: (a as any).amount },
          to: { type: "move", from, to, amount: (a as any).amount },
        });
      }
      if (!(adjacency[from] ?? []).includes(to)) {
        issues.push({ kind: "drop", index: i, reason: "move not along an edge", action: a });
        continue;
      }
      if (!nodes[from] || !nodes[to]) {
        issues.push({ kind: "drop", index: i, reason: "unknown from/to node id", action: a });
        continue;
      }

      const avail = forcesRemaining[from] ?? 0;
      if (avail < 1) {
        issues.push({ kind: "drop", index: i, reason: "no available forces at move.from", action: a });
        continue;
      }

      const amt0 = clampInt((a as any).amount);
      if (amt0 === null) {
        issues.push({ kind: "drop", index: i, reason: "move.amount is not a number", action: a });
        continue;
      }
      const amt = Math.max(1, amt0);
      const finalAmt = Math.min(amt, avail);
      if (finalAmt !== amt) {
        issues.push({
          kind: "clamp",
          index: i,
          reason: "move amount clamped to available forces",
          from: a,
          to: { type: "move", from, to, amount: finalAmt },
        });
      }
      out.push({ type: "move", from, to, amount: finalAmt });
      forcesRemaining[from] = avail - finalAmt;
      forcesRemaining[to] = (forcesRemaining[to] ?? 0) + finalAmt;
      continue;
    }
  }

  if (out.length > 0) return { actions: out, usedFallback: false, issues };

  // Default behavior is to be non-strategic: if the model gives no usable actions, pass.
  // (A strategic fallback can be enabled explicitly via --fallback=stub.)
  if (params.fallbackMode !== "stub") return { actions: [{ type: "pass" }], usedFallback: false, issues };

  const shouldFallback = hasAnyLegalNonPassAction(req, scenario, adjacency);
  if (!shouldFallback) return { actions: [{ type: "pass" }], usedFallback: false, issues };
  const fallback = chooseStubActions(req, scenario, adjacency);
  return { actions: fallback.actions.slice(0, budget), usedFallback: true, issues };
}

function jsonResponse(res: http.ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(payload);
}

function buildAdjacency(nodes: string[], edges: [string, string][]): Record<string, string[]> {
  const adj: Record<string, Set<string>> = {};
  for (const n of nodes) adj[n] = new Set();
  for (const [a, b] of edges) {
    if (!adj[a] || !adj[b]) continue;
    adj[a].add(b);
    adj[b].add(a);
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(adj)) out[k] = Array.from(v).sort();
  return out;
}

async function loadScenarioById(scenarioDir: string, scenarioId: string): Promise<Scenario> {
  const candidate = path.join(scenarioDir, `${scenarioId}.json`);
  const text = await readFile(candidate, "utf8");
  return JSON.parse(text) as Scenario;
}

function chooseStubActions(req: AgentRequest, scenario: Scenario, adjacency: Record<string, string[]>): AgentResponse {
  const player = req.player;
  const enemy = otherPlayer(player);
  const obs = req.observation ?? {};
  const nodes: Record<string, any> = obs.nodes ?? {};
  const supplies: Record<PlayerId, number> = obs.supplies ?? { P1: 0, P2: 0 };

  // Prefer reinforcing if possible (keeps the game moving).
  const cost = scenario.settings?.reinforceCostPerStrength ?? 1;
  const baseIncome = scenario.settings?.baseIncome ?? 0;
  const income = sumIncomeFromObservation(obs, player, baseIncome);
  const supply = (Number.isFinite(supplies[player]) ? supplies[player] : 0) + income;
  if (supply >= cost) {
    return {
      api_version: req.api_version,
      actions: [{ type: "reinforce", amount: 1 }],
      rationale_text: "stub: reinforce 1",
    };
  }

  // Move 1 unit toward enemy HQ if possible.
  const enemyHq = scenario.players[enemy].hq;
  const dist: Record<string, number> = {};
  const q: string[] = [enemyHq];
  dist[enemyHq] = 0;
  while (q.length > 0) {
    const cur = q.shift()!;
    const nd = dist[cur]! + 1;
    for (const n of adjacency[cur] ?? []) {
      if (dist[n] === undefined) {
        dist[n] = nd;
        q.push(n);
      }
    }
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[player];
    if (!Number.isFinite(f) || f <= 0) continue;
    const neighbors = adjacency[nodeId] ?? [];
    if (neighbors.length === 0) continue;
    const best = neighbors
      .slice()
      .sort((a, b) => (dist[a] ?? 999) - (dist[b] ?? 999) || a.localeCompare(b))[0];
    if (!best) continue;
    return {
      api_version: req.api_version,
      actions: [{ type: "move", from: nodeId, to: best, amount: 1 }],
      rationale_text: `stub: move 1 ${nodeId}→${best}`,
    };
  }

  return { api_version: req.api_version, actions: [{ type: "pass" }], rationale_text: "stub: pass" };
}

type MemoryState = { text: string; updatedAtPly: number };

function parseOnOffFlag(value: string | undefined, defaultValue: boolean): boolean {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === "true" || raw === "1" || raw === "yes" || raw === "on") return true;
  if (raw === "false" || raw === "0" || raw === "no" || raw === "off") return false;
  throw new Error(`invalid boolean flag '${value}' (expected on|off)`);
}

function clampMemoryText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!Number.isFinite(maxChars) || maxChars <= 0) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).replace(/\s+\S*$/, "").trim();
}

function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function sumSupplyYieldOwned(nodes: Record<string, any>, player: PlayerId): number {
  let sum = 0;
  for (const n of Object.values(nodes)) {
    if (!n) continue;
    if (n.owner !== player) continue;
    const y = n.supplyYield;
    if (typeof y === "number" && Number.isFinite(y)) sum += y;
  }
  return sum;
}

function bfsDistances(adjacency: Record<string, string[]>, start: string): Record<string, number> {
  const dist: Record<string, number> = {};
  if (!start) return dist;
  const q: string[] = [start];
  dist[start] = 0;
  while (q.length > 0) {
    const cur = q.shift()!;
    const nd = dist[cur]! + 1;
    for (const n of adjacency[cur] ?? []) {
      if (dist[n] === undefined) {
        dist[n] = nd;
        q.push(n);
      }
    }
  }
  return dist;
}

function engineStateFromObservation(request: AgentRequest, scenario: Scenario): any {
  const obs: any = request.observation ?? {};
  const suppliesRaw: any = obs.supplies ?? {};
  const supplies = {
    P1: Math.max(0, Math.floor(Number.isFinite(suppliesRaw.P1) ? Number(suppliesRaw.P1) : 0)),
    P2: Math.max(0, Math.floor(Number.isFinite(suppliesRaw.P2) ? Number(suppliesRaw.P2) : 0)),
  };

  const nodesRaw: Record<string, any> = obs.nodes ?? {};
  const nodes: Record<string, any> = {};
  for (const [id, n] of Object.entries(nodesRaw)) {
    const forcesRaw: any = n?.forces ?? {};
    nodes[id] = {
      id: typeof n?.id === "string" ? n.id : id,
      x: Number.isFinite(n?.x) ? Number(n.x) : 0,
      y: Number.isFinite(n?.y) ? Number(n.y) : 0,
      owner: typeof n?.owner === "string" ? n.owner : "Neutral",
      supplyYield: Math.max(0, Math.floor(Number.isFinite(n?.supplyYield) ? Number(n.supplyYield) : 0)),
      forces: {
        P1: Math.max(0, Math.floor(Number.isFinite(forcesRaw.P1) ? Number(forcesRaw.P1) : 0)),
        P2: Math.max(0, Math.floor(Number.isFinite(forcesRaw.P2) ? Number(forcesRaw.P2) : 0)),
      },
    };
  }

  return {
    scenarioId: scenario.id,
    ply: request.ply,
    activePlayer: request.player,
    supplies,
    nodes,
  };
}

function scoreOnePly(params: {
  request: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
  actions: Action[];
  issues: Array<{ kind: string }>;
  candidateIndex: number;
}): { score: number; captures: number; winNow: boolean; minDistToEnemyHq: number | null; deltaYieldOwned: number } {
  const player = params.request.player;
  const enemy = otherPlayer(player);

  const state0 = engineStateFromObservation(params.request, params.scenario);
  const yield0 = sumSupplyYieldOwned(state0.nodes ?? {}, player);

  const rngSeed = fnv1a32(`${params.request.match_id}|${player}|${params.request.ply}|cand${params.candidateIndex}`) || 1;
  const rng = new PRNG(rngSeed);
  const ctx = { scenario: params.scenario as any, adjacency: params.adjacency as any };
  const out = applyTurn(ctx as any, state0 as any, params.actions as any, rng);

  const events: any[] = Array.isArray(out.events) ? out.events : [];
  const captures = events.filter((e) => e && e.type === "capture").length;
  const winNow = !!(out.result && out.result.type === "win" && out.result.winner === player);

  const stateAfter: any = out.state ?? {};
  const nodesAfter: Record<string, any> = stateAfter.nodes ?? {};
  const yieldAfter = sumSupplyYieldOwned(nodesAfter, player);
  const deltaYieldOwned = yieldAfter - yield0;

  const enemyHq = params.scenario.players?.[enemy]?.hq ?? "";
  const dist = bfsDistances(params.adjacency, enemyHq);
  let minDist: number | null = null;
  for (const [id, n] of Object.entries(nodesAfter)) {
    const f = n?.forces?.[player];
    if (!Number.isFinite(f) || f <= 0) continue;
    const d = dist[id];
    if (typeof d !== "number") continue;
    if (minDist === null || d < minDist) minDist = d;
  }

  const issuePenalty = params.issues.filter((i) => i.kind !== "normalize").length;
  const passPenalty = params.actions.length === 1 && params.actions[0]?.type === "pass" ? 1 : 0;

  let score = 0;
  if (winNow) score += 1_000_000_000;
  score += captures * 1_000_000;
  score += deltaYieldOwned * 50_000;
  score += yieldAfter * 1_000;
  if (minDist !== null) score -= minDist * 200;
  score -= issuePenalty * 2_000;
  if (passPenalty) score -= 5_000_000;

  return { score, captures, winNow, minDistToEnemyHq: minDist, deltaYieldOwned };
}

async function maybeLogIo(params: {
  logDir?: string;
  request: AgentRequest;
  response: unknown;
  provider: Provider;
  latencyMs: number;
  error?: string;
  httpStatus?: number;
}) {
  if (!params.logDir) return;
  const dir = path.resolve(params.logDir, params.request.match_id);
  const file = path.join(dir, `ply_${String(params.request.ply).padStart(4, "0")}_${params.request.player}.json`);
  await mkdir(dir, { recursive: true });
  await writeFile(
    file,
    JSON.stringify(
      {
        provider: params.provider,
        request: params.request,
        response: params.response,
        latencyMs: params.latencyMs,
        httpStatus: params.httpStatus,
        error: params.error,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const args = parseArgs(process.argv);

  const port = Number.parseInt(args.get("--port") ?? process.env.ASG_AGENT_PORT ?? "8787", 10);
  const provider = (args.get("--provider") ?? process.env.ASG_AGENT_PROVIDER ?? "stub") as Provider;
  const scenarioDir = args.get("--scenario-dir") ?? process.env.ASG_SCENARIO_DIR ?? path.resolve("scenarios");
  const logDir = args.get("--log-dir") ?? process.env.ASG_AGENT_LOG_DIR ?? undefined;
  const maxRequestBytes = Number.parseInt(args.get("--max-request-bytes") ?? "1048576", 10);
  const fallbackMode = (args.get("--fallback") ?? process.env.ASG_AGENT_FALLBACK ?? "pass").toLowerCase();

  const memoryEnabled = parseOnOffFlag(args.get("--memory"), false);
  const memoryMaxChars = Number.parseInt(args.get("--memory-max-chars") ?? "600", 10);
  const warmupMode = (args.get("--warmup") ?? "off").toLowerCase(); // off|inline|separate
  const warmupTimeoutMs = Number.parseInt(args.get("--warmup-timeout-ms") ?? "5000", 10);
  const warmupMaxTokens = Number.parseInt(args.get("--warmup-max-tokens") ?? "200", 10);

  const repairEnabled = parseOnOffFlag(args.get("--repair"), false);
  const repairMaxRounds = Number.parseInt(args.get("--repair-max-rounds") ?? "1", 10);

  const selectModeRaw = (args.get("--select-mode") ?? "off").toLowerCase(); // off|one_ply
  if (!["off", "one_ply"].includes(selectModeRaw)) throw new Error("--select-mode must be off|one_ply");
  const selectMode = selectModeRaw as "off" | "one_ply";
  const selectK = Number.parseInt(args.get("--select-k") ?? "1", 10);
  const selectCandidateTemperature = Number.parseFloat(args.get("--select-candidate-temperature") ?? "0.2");
  const selectUntilPly = Number.parseInt(args.get("--select-until-ply") ?? "30", 10);

  if (!Number.isInteger(port) || port <= 0) throw new Error("--port must be a positive integer");
  if (!["stub", "openai_compat"].includes(provider)) throw new Error("--provider must be stub or openai_compat");
  if (!["pass", "stub"].includes(fallbackMode)) throw new Error("--fallback must be pass or stub");
  if (memoryEnabled && (!Number.isInteger(memoryMaxChars) || memoryMaxChars < 50)) throw new Error("--memory-max-chars must be an integer >= 50");
  if (!["off", "inline", "separate"].includes(warmupMode)) throw new Error("--warmup must be off|inline|separate");
  if (!Number.isInteger(warmupTimeoutMs) || warmupTimeoutMs < 500) throw new Error("--warmup-timeout-ms must be an integer >= 500");
  if (!Number.isInteger(warmupMaxTokens) || warmupMaxTokens < 50) throw new Error("--warmup-max-tokens must be an integer >= 50");
  if (!Number.isInteger(repairMaxRounds) || repairMaxRounds < 0 || repairMaxRounds > 3) throw new Error("--repair-max-rounds must be an integer in [0,3]");
  if (!Number.isInteger(selectK) || selectK < 1 || selectK > 8) throw new Error("--select-k must be an integer in [1,8]");
  if (!Number.isFinite(selectCandidateTemperature) || selectCandidateTemperature < 0 || selectCandidateTemperature > 2) {
    throw new Error("--select-candidate-temperature must be in [0,2]");
  }
  if (!Number.isInteger(selectUntilPly) || selectUntilPly < 0 || selectUntilPly > 1000) throw new Error("--select-until-ply must be an integer in [0,1000]");

  const scenarioCache = new Map<string, { scenario: Scenario; adjacency: Record<string, string[]> }>();
  const memoryByKey = new Map<string, MemoryState>();

  const server = http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("access-control-allow-origin", "*");
      res.setHeader("access-control-allow-methods", "POST, OPTIONS");
      res.setHeader("access-control-allow-headers", "content-type, authorization");
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/act") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    res.setHeader("access-control-allow-origin", "*");

    const startedAt = Date.now();
    let parsed: unknown;
    let request: AgentRequest | null = null;

    try {
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of req) {
        const buf = Buffer.from(chunk);
        total += buf.length;
        if (total > maxRequestBytes) throw new Error(`request too large (${total} bytes)`);
        chunks.push(buf);
      }
      parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      jsonResponse(res, 200, { api_version: "0.1", actions: [{ type: "pass" }], rationale_text: `server: bad JSON (${err})` });
      return;
    }

    try {
      if (!isObject(parsed)) throw new Error("request must be an object");
      if (typeof parsed.api_version !== "string" || parsed.api_version.length === 0) throw new Error("api_version required");
      if (typeof parsed.match_id !== "string" || parsed.match_id.length === 0) throw new Error("match_id required");
      if (parsed.player !== "P1" && parsed.player !== "P2") throw new Error("player must be P1|P2");
      if (typeof parsed.scenario_id !== "string" || parsed.scenario_id.length === 0) throw new Error("scenario_id required");
      if (!Number.isInteger(parsed.ply) || (parsed.ply as number) < 0) throw new Error("ply must be integer >= 0");
      if (!Number.isInteger(parsed.action_budget) || (parsed.action_budget as number) < 0)
        throw new Error("action_budget must be integer >= 0");
      if (!isObject(parsed.observation)) throw new Error("observation must be an object");

      request = parsed as unknown as AgentRequest;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const fallback: AgentResponse = { api_version: "0.1", actions: [{ type: "pass" }], rationale_text: `server: invalid request (${err})` };
      jsonResponse(res, 200, fallback);
      return;
    }

    const budget = Math.max(0, request.action_budget);
    let scenarioEntry = scenarioCache.get(request.scenario_id);
    if (!scenarioEntry) {
      try {
        const scenario = await loadScenarioById(scenarioDir, request.scenario_id);
        const nodes = scenario.map.nodes.map((n) => n.id);
        const adjacency = buildAdjacency(nodes, scenario.map.edges);
        scenarioEntry = { scenario, adjacency };
        scenarioCache.set(request.scenario_id, scenarioEntry);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        const latencyMs = Date.now() - startedAt;
        const fallback: AgentResponse = {
          api_version: request.api_version,
          actions: [{ type: "pass" }],
          rationale_text: `server: unknown scenario (${err})`,
        };
        await maybeLogIo({ logDir, request, response: fallback, provider, latencyMs, error: err });
        jsonResponse(res, 200, fallback);
        return;
      }
    }

    const { scenario, adjacency } = scenarioEntry;

    let response: AgentResponse;
    let error: string | undefined;
    let upstreamStatus: number | undefined;
    let upstreamRaw: unknown | undefined;
    let agentInfo: AgentResponse["agent_info"] | undefined;

    const memoryKey = `${request.match_id}|${request.player}`;
    const existingMemory = memoryEnabled ? memoryByKey.get(memoryKey) : undefined;

    if (provider === "openai_compat") {
      const providerNameRaw = args.get("--provider-name") ?? process.env.ASG_OPENAI_PROVIDER ?? "openai";
      const providerKey = providerNameRaw.toLowerCase();
      const baseUrl =
        args.get("--base-url") ??
        process.env[`ASG_${providerNameRaw.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_BASE_URL`] ??
        process.env.ASG_OPENAI_BASE_URL ??
        undefined;
      const modelArg0 = args.get("--model") ?? process.env.ASG_OPENAI_MODEL ?? undefined;
      // Opinionated default for this repo's current prototype: OpenRouter -> Grok 4.1 Fast.
      // Allows omitting --model when using OpenRouter.
      if (!modelArg0 && providerKey === "openrouter") args.set("--model", "x-ai/grok-4.1-fast");
      const modelArg = args.get("--model") ?? process.env.ASG_OPENAI_MODEL ?? undefined;
      agentInfo = {
        provider: providerKey,
        baseUrl,
        model: modelArg && modelArg !== "auto" ? modelArg : undefined,
        modelMode: modelArg === "auto" ? "auto" : modelArg ? "explicit" : undefined,
      };
    }

    try {
      if (provider === "stub") {
        response = chooseStubActions(request, scenario, adjacency);
      } else {
        const { openAiCompatAct } = await import("../providers/openaiCompat.js");

        // Optional warmup (separate call once per match/player).
        if (memoryEnabled && warmupMode === "separate" && !existingMemory) {
          const warmupArgs = new Map(args);
          warmupArgs.set("--timeout-ms", String(warmupTimeoutMs));
          warmupArgs.set("--max-tokens", String(warmupMaxTokens));
          warmupArgs.set("--temperature", "0");

          try {
            const warmupOut = await openAiCompatAct({
              request,
              scenario,
              adjacency,
              args: warmupArgs,
              allowMemoryUpdate: true,
              purpose: "warmup",
            });
            const mu = typeof warmupOut.response.memory_update === "string" ? warmupOut.response.memory_update : "";
            const clamped = clampMemoryText(mu, memoryMaxChars);
            if (clamped) memoryByKey.set(memoryKey, { text: clamped, updatedAtPly: request.ply });
          } catch {
            // Warmup is best-effort; proceed without memory.
          }
        }

        const memoryNow = memoryEnabled ? memoryByKey.get(memoryKey)?.text : undefined;
        const allowMemoryUpdate = memoryEnabled && warmupMode === "inline" && !memoryNow && request.ply === 0;

        const selectEnabled = provider === "openai_compat" && selectMode === "one_ply" && selectK > 1 && request.ply <= selectUntilPly;
        if (selectEnabled) {
          const baseTimeoutMs = Number.parseInt(args.get("--timeout-ms") ?? "70000", 10);
          const deadlineAt = startedAt + (Number.isFinite(baseTimeoutMs) ? baseTimeoutMs : 70000);

          const candidates: Array<{
            out: Awaited<ReturnType<typeof openAiCompatAct>>;
            actions: Action[];
            issues: Array<{ kind: string }>;
            score: number;
          }> = [];

          for (let i = 0; i < selectK; i++) {
            const remaining = Math.max(0, deadlineAt - Date.now());
            if (remaining < 1500) break;
            const perCall = Math.max(1000, Math.floor(remaining / Math.max(1, selectK - i)));
            const candArgs = new Map(args);
            candArgs.set("--timeout-ms", String(perCall));
            candArgs.set("--temperature", String(selectCandidateTemperature));

            try {
              const out = await openAiCompatAct({
                request,
                scenario,
                adjacency,
                args: candArgs,
                memory: memoryNow,
                allowMemoryUpdate: false,
                purpose: "act",
              });

              const sanitizedCand = sanitizeActionsAgainstObservation({
                actions: out.response.actions,
                budget,
                req: request,
                scenario,
                adjacency,
                fallbackMode: fallbackMode as "pass" | "stub",
              });

              const scored = scoreOnePly({
                request,
                scenario,
                adjacency,
                actions: sanitizedCand.actions,
                issues: sanitizedCand.issues,
                candidateIndex: i,
              });

              candidates.push({ out, actions: sanitizedCand.actions, issues: sanitizedCand.issues, score: scored.score });
            } catch {
              // Best-effort: skip failed candidates.
            }
          }

          if (candidates.length === 0) {
            const out = await openAiCompatAct({
              request,
              scenario,
              adjacency,
              args,
              memory: memoryNow,
              allowMemoryUpdate,
              purpose: "act",
            });
            response = out.response;
            upstreamStatus = out.httpStatus;
            upstreamRaw = out.raw;
            response.agent_info = {
              provider: out.provider,
              baseUrl: out.baseUrl,
              model: out.resolvedModel,
              modelMode: (args.get("--model") ?? process.env.ASG_OPENAI_MODEL ?? "").toLowerCase() === "auto" ? "auto" : "explicit",
            };

            if (memoryEnabled && allowMemoryUpdate && typeof response.memory_update === "string") {
              const clamped = clampMemoryText(response.memory_update, memoryMaxChars);
              if (clamped) memoryByKey.set(memoryKey, { text: clamped, updatedAtPly: request.ply });
            }
          } else {
            candidates.sort((a, b) => b.score - a.score || a.issues.length - b.issues.length);
            const best = candidates[0]!;
            response = best.out.response;
            response.actions = best.actions;
            upstreamStatus = best.out.httpStatus;
            upstreamRaw = best.out.raw;
            response.agent_info = {
              provider: best.out.provider,
              baseUrl: best.out.baseUrl,
              model: best.out.resolvedModel,
              modelMode: (args.get("--model") ?? process.env.ASG_OPENAI_MODEL ?? "").toLowerCase() === "auto" ? "auto" : "explicit",
            };
          }
        } else {
          const out = await openAiCompatAct({
            request,
            scenario,
            adjacency,
            args,
            memory: memoryNow,
            allowMemoryUpdate,
            purpose: "act",
          });
          response = out.response;
          upstreamStatus = out.httpStatus;
          upstreamRaw = out.raw;
          response.agent_info = {
            provider: out.provider,
            baseUrl: out.baseUrl,
            model: out.resolvedModel,
            modelMode: (args.get("--model") ?? process.env.ASG_OPENAI_MODEL ?? "").toLowerCase() === "auto" ? "auto" : "explicit",
          };

          if (memoryEnabled && allowMemoryUpdate && typeof response.memory_update === "string") {
            const clamped = clampMemoryText(response.memory_update, memoryMaxChars);
            if (clamped) memoryByKey.set(memoryKey, { text: clamped, updatedAtPly: request.ply });
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      response = { api_version: request.api_version, actions: [{ type: "pass" }], rationale_text: `server: ${provider} error (${error})` };
      if (agentInfo) response.agent_info = agentInfo;
    }

    // Optional repair loop (retry once with validator feedback).
    let sanitized = sanitizeActionsAgainstObservation({
      actions: response.actions,
      budget,
      req: request,
      scenario,
      adjacency,
      fallbackMode: fallbackMode as "pass" | "stub",
    });

    const repairIssues = sanitized.issues.filter((i) => i.kind !== "normalize");
    if (provider === "openai_compat" && repairEnabled && repairIssues.length > 0 && repairMaxRounds > 0) {
      const baseTimeoutMs = Number.parseInt(args.get("--timeout-ms") ?? "70000", 10);
      const deadlineAt = startedAt + (Number.isFinite(baseTimeoutMs) ? baseTimeoutMs : 70000);
      const remainingMs = Math.max(1000, deadlineAt - Date.now());
      const repairArgs = new Map(args);
      repairArgs.set("--timeout-ms", String(remainingMs));
      // Prefer deterministic repairs.
      repairArgs.set("--temperature", "0");

      const feedback = {
        issues: repairIssues.slice(0, 10),
        note: "Output a corrected actions list. Do not include invalid moves or unaffordable reinforces.",
      };

      try {
        const { openAiCompatAct } = await import("../providers/openaiCompat.js");
        const memoryNow = memoryEnabled ? memoryByKey.get(memoryKey)?.text : undefined;
        const repairOut = await openAiCompatAct({
          request,
          scenario,
          adjacency,
          args: repairArgs,
          memory: memoryNow,
          allowMemoryUpdate: false,
          purpose: "repair",
          repairFeedback: feedback,
        });
        response = repairOut.response;
        upstreamStatus = repairOut.httpStatus;
        upstreamRaw = repairOut.raw;
        sanitized = sanitizeActionsAgainstObservation({
          actions: response.actions,
          budget,
          req: request,
          scenario,
          adjacency,
          fallbackMode: fallbackMode as "pass" | "stub",
        });
      } catch (e) {
        // Best-effort; keep first sanitized result.
        void e;
      }
    }

    response.actions = sanitized.actions;
    if (sanitized.usedFallback) {
      const prev = response.rationale_text ? `${response.rationale_text}; ` : "";
      response.rationale_text = `${prev}fallback=stub`;
    }
    response.server_diagnostics = {
      provider,
      upstreamStatus,
      upstreamError: error,
      usedFallback: sanitized.usedFallback,
    };
    delete (response as any).memory_update;
    if (response.api_version !== request.api_version) {
      response = { api_version: request.api_version, actions: [{ type: "pass" }], rationale_text: "server: api_version mismatch" };
    }

    const latencyMs = Date.now() - startedAt;
    await maybeLogIo({
      logDir,
      request,
      response: { response, upstreamStatus, upstreamRaw },
      provider,
      latencyMs,
      error,
      httpStatus: upstreamStatus,
    });

    jsonResponse(res, 200, response);
  });

  server.listen(port, () => {
    console.log(`ASG agent server listening on http://127.0.0.1:${port}/act`);
    console.log(`provider=${provider}`);
    console.log(`scenarioDir=${scenarioDir}`);
    if (logDir) console.log(`logDir=${logDir}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
