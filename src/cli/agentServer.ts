import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

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
}): { actions: Action[]; usedFallback: boolean } {
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

  for (const a of raw) {
    if (out.length >= budget) break;
    if (!isAction(a)) continue;

    if (a.type === "pass") continue;

    if (a.type === "reinforce") {
      const amt0 = clampInt((a as any).amount);
      if (amt0 === null) continue;
      const amt = Math.max(1, amt0);
      const maxAffordable = Math.floor(supplyRemaining / cost);
      if (maxAffordable < 1) continue;
      const finalAmt = Math.min(amt, maxAffordable);
      out.push({ type: "reinforce", amount: finalAmt });
      supplyRemaining -= finalAmt * cost;
      continue;
    }

    if (a.type === "move") {
      const fromRaw = (a as any).from;
      const toRaw = (a as any).to;
      if (typeof fromRaw !== "string" || typeof toRaw !== "string") continue;
      const fromTrimmed = fromRaw.trim();
      const toTrimmed = toRaw.trim();
      const from = nodeIdByLower.get(fromTrimmed.toLowerCase()) ?? fromTrimmed;
      const to = nodeIdByLower.get(toTrimmed.toLowerCase()) ?? toTrimmed;
      if (!(adjacency[from] ?? []).includes(to)) continue;
      if (!nodes[from] || !nodes[to]) continue;

      const avail = forcesRemaining[from] ?? 0;
      if (avail < 1) continue;

      const amt0 = clampInt((a as any).amount);
      if (amt0 === null) continue;
      const amt = Math.max(1, amt0);
      const finalAmt = Math.min(amt, avail);
      out.push({ type: "move", from, to, amount: finalAmt });
      forcesRemaining[from] = avail - finalAmt;
      forcesRemaining[to] = (forcesRemaining[to] ?? 0) + finalAmt;
      continue;
    }
  }

  if (out.length > 0) return { actions: out, usedFallback: false };

  // Default behavior is to be non-strategic: if the model gives no usable actions, pass.
  // (A strategic fallback can be enabled explicitly via --fallback=stub.)
  if (params.fallbackMode !== "stub") return { actions: [{ type: "pass" }], usedFallback: false };

  const shouldFallback = hasAnyLegalNonPassAction(req, scenario, adjacency);
  if (!shouldFallback) return { actions: [{ type: "pass" }], usedFallback: false };
  const fallback = chooseStubActions(req, scenario, adjacency);
  return { actions: fallback.actions.slice(0, budget), usedFallback: true };
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

  if (!Number.isInteger(port) || port <= 0) throw new Error("--port must be a positive integer");
  if (!["stub", "openai_compat"].includes(provider)) throw new Error("--provider must be stub or openai_compat");
  if (!["pass", "stub"].includes(fallbackMode)) throw new Error("--fallback must be pass or stub");

  const scenarioCache = new Map<string, { scenario: Scenario; adjacency: Record<string, string[]> }>();

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
        const out = await openAiCompatAct({
          request,
          scenario,
          adjacency,
          args,
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
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      response = { api_version: request.api_version, actions: [{ type: "pass" }], rationale_text: `server: ${provider} error (${error})` };
      if (agentInfo) response.agent_info = agentInfo;
    }

    const sanitized = sanitizeActionsAgainstObservation({
      actions: response.actions,
      budget,
      req: request,
      scenario,
      adjacency,
      fallbackMode: fallbackMode as "pass" | "stub",
    });
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
