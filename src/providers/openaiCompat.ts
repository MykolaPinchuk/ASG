import {
  fetchOpenAiCompatModelIds,
  getProviderAllowlist,
  loadOssModelsConfig,
  normalizeBaseUrl,
} from "../llm/models.js";

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

type ProviderArgs = Map<string, string>;

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

type Action =
  | { type: "pass" }
  | { type: "reinforce"; amount: number }
  | { type: "move"; from: string; to: string; amount: number };

type AgentResponse = {
  api_version: string;
  actions: Action[];
  rationale_text?: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractJsonObject(text: string): unknown {
  // Prefer raw JSON.
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract the first {...} block.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = text.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("no JSON object found in model output");
  }
}

function tryExtractCompleteJsonObject(text: string): unknown | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validateAgentResponse(json: unknown, expectedApiVersion: string): AgentResponse {
  if (!isObject(json)) throw new Error("JSON invalid: model output must be an object");

  const coerceInt = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
    if (typeof value === "string") {
      const t = value.trim();
      if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
    }
    return null;
  };

  const actionsRaw = (json as any).actions;
  if (!Array.isArray(actionsRaw)) throw new Error("JSON invalid: actions must be an array");
  if (actionsRaw.length === 0) throw new Error("JSON invalid: actions must be a non-empty array");

  const actions: Action[] = [];
  for (const a of actionsRaw) {
    if (!isObject(a)) throw new Error("JSON invalid: each action must be an object");
    const type = (a as any).type;

    if (type === "pass") {
      actions.push({ type: "pass" });
      continue;
    }

    if (type === "reinforce") {
      const amount = coerceInt((a as any).amount);
      if (amount === null || amount < 1) throw new Error("JSON invalid: reinforce.amount must be an integer >= 1");
      actions.push({ type: "reinforce", amount });
      continue;
    }

    if (type === "move") {
      const fromRaw = (a as any).from;
      const toRaw = (a as any).to;
      const amount = coerceInt((a as any).amount);
      const from = typeof fromRaw === "string" ? fromRaw.trim() : "";
      const to = typeof toRaw === "string" ? toRaw.trim() : "";
      if (!from) throw new Error("JSON invalid: move.from must be a non-empty string");
      if (!to) throw new Error("JSON invalid: move.to must be a non-empty string");
      if (amount === null || amount < 1) throw new Error("JSON invalid: move.amount must be an integer >= 1");
      actions.push({ type: "move", from, to, amount });
      continue;
    }

    throw new Error(`JSON invalid: unknown action type '${String(type)}'`);
  }

  // Some models omit or corrupt api_version; treat it as metadata and force the expected version.
  const apiVersion = expectedApiVersion;
  const rationale_text = typeof (json as any).rationale_text === "string" ? (json as any).rationale_text : undefined;
  return { api_version: apiVersion, actions, rationale_text };
}

function buildToolSchema() {
  // OpenAI-compatible "tools" schema to force JSON arguments (when supported).
  return [
    {
      type: "function",
      function: {
        name: "act",
        description: "Return actions for the current ply.",
        parameters: {
          type: "object",
          additionalProperties: false,
          required: ["api_version", "actions"],
          properties: {
            api_version: { const: "0.1" },
            rationale_text: { type: "string" },
            actions: {
              type: "array",
              items: {
                oneOf: [
                  { type: "object", additionalProperties: false, required: ["type"], properties: { type: { const: "pass" } } },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "amount"],
                    properties: { type: { const: "reinforce" }, amount: { type: "integer", minimum: 1 } },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    required: ["type", "from", "to", "amount"],
                    properties: {
                      type: { const: "move" },
                      from: { type: "string" },
                      to: { type: "string" },
                      amount: { type: "integer", minimum: 1 },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  ];
}

function buildSystemPrompt() {
  return [
    "You are an agent that plays a deterministic, turn-based strategy game.",
    "You must respond with VALID JSON ONLY (no markdown, no code fences, no commentary).",
    "Your response must start with '{' and end with '}' (a single JSON object).",
    "Do NOT output your reasoning. Think silently; output only the JSON object.",
    "After you output the JSON object, STOP. Do not add any extra text after the final '}'.",
    "Heuristics (not rules):",
    "- Use the full action_budget to chain moves and make progress every ply.",
    "- Prefer concentrating forces into one strong stack (moving 1 unit is usually weak).",
    "- Prefer actions that reduce distance to the enemy HQ; capturing enemy HQ wins immediately.",
    "Rules for JSON:",
    "- Use double quotes for all strings and keys.",
    "- No trailing commas.",
    "- Output must be a single JSON object.",
    "Your response must match this schema:",
    `{ "api_version": "0.1", "actions": [ ... ], "rationale_text": "optional" }`,
    "Valid actions (array order matters; the runner may truncate to action_budget):",
    `- {"type":"pass"}`,
    `- {"type":"reinforce","amount": <positive integer>}`,
    `- {"type":"move","from":"<node_id>","to":"<node_id>","amount": <positive integer>}`,
    "Important:",
    "- Actions apply SEQUENTIALLY in the order you provide (state updates after each action).",
    "- Use the full action_budget: you can chain multiple moves in one ply (multi-hop) by moving forces, then moving from the destination.",
    "Game rules (important):",
    "- Plies alternate: P1 then P2 then P1 ...",
    "- At start of each ply, ACTIVE player gains supply: baseIncome + sum(supplyYield of nodes they own).",
    "- Reinforce adds forces to your HQ only and costs: amount * reinforceCostPerStrength (you can spend the income gained this ply).",
    "- Move transfers forces along an edge. You cannot move more forces than you have at the 'from' node.",
    "- If after a move both sides have forces at the destination, combat resolves immediately with randomness:",
    "  let A=attackerStrength, D=defenderStrength, n=floor(min(A,D)*combatVarianceFraction) (at least 1), noise ~ Uniform[-n, +n], delta=(A-D)+noise.",
    "  if delta>0 attacker wins with delta remaining; if delta<0 defender wins with -delta; if delta==0 coin flip winner with 1 remaining.",
    "- After combat (or if no defender forces), if you have forces>0 and enemy has 0 at a node, you capture it (owner becomes you).",
    "- You WIN immediately if you capture the enemy HQ node.",
    "Rules reminders:",
    "- move only along an edge from the provided adjacency list.",
    "- do not exceed available forces at the from node.",
    "- reinforce costs supply: amount * reinforceCostPerStrength.",
    "Never output an empty actions array; include at least one action.",
    "Only return pass if you truly cannot find ANY legal non-pass action.",
    "Keep rationale_text short (<= 1 sentence) or omit it.",
  ].join("\n");
}

function shouldAddThinkingHint(params: { args: ProviderArgs }): boolean {
  // Default: ON for all models (can be disabled).
  const mode = (params.args.get("--think-hint") ?? process.env.ASG_OPENAI_THINK_HINT ?? "on").toLowerCase();
  if (mode === "off" || mode === "false" || mode === "0") return false;
  if (mode === "on" || mode === "true" || mode === "1") return true;
  throw new Error(`invalid --think-hint '${mode}' (expected on|off)`);
}

function sumIncomeFromObservation(obs: any, player: PlayerId, baseIncome: number): number {
  let income = baseIncome;
  const nodes: Record<string, any> = obs?.nodes ?? {};
  for (const node of Object.values(nodes)) {
    if (node?.owner === player) income += Number.isFinite(node?.supplyYield) ? Number(node.supplyYield) : 0;
  }
  return income;
}

function bfsDistances(adjacency: Record<string, string[]>, start: string): Record<string, number> {
  const dist: Record<string, number> = {};
  if (!start || !adjacency[start]) return dist;
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

function buildShortestPathTowardTarget(
  adjacency: Record<string, string[]>,
  distToTarget: Record<string, number>,
  start: string,
  maxNodes = 64,
): string[] {
  const out: string[] = [];
  if (!start || distToTarget[start] === undefined) return out;
  let cur = start;
  out.push(cur);
  for (let i = 0; i < maxNodes; i++) {
    const d = distToTarget[cur];
    if (d === undefined || d <= 0) break;
    const neighbors = adjacency[cur] ?? [];
    const next = neighbors
      .slice()
      .sort((a, b) => (distToTarget[a] ?? 999) - (distToTarget[b] ?? 999) || a.localeCompare(b))
      .find((n) => (distToTarget[n] ?? 999) < d);
    if (!next) break;
    cur = next;
    out.push(cur);
    if (distToTarget[cur] === 0) break;
  }
  return out;
}

function buildUserPromptCompact(params: {
  request: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
}) {
  const { request, scenario, adjacency } = params;
  const enemy = request.player === "P1" ? "P2" : "P1";

  const settings = scenario.settings;
  const cost = settings.reinforceCostPerStrength ?? 1;
  const obs = request.observation ?? {};
  const supplies = obs.supplies ?? { P1: 0, P2: 0 };
  const playerSupply = Number.isFinite(supplies?.[request.player]) ? supplies[request.player] : 0;
  const baseIncome = settings.baseIncome ?? 0;
  const incomeThisPly = sumIncomeFromObservation(obs, request.player, baseIncome);
  const supplyAfterIncome = playerSupply + incomeThisPly;
  const maxReinforce = Math.max(0, Math.floor(supplyAfterIncome / cost));

  const moveOptions: Array<{ from: string; to: string; maxAmount: number }> = [];
  const nodes: Record<string, any> = obs.nodes ?? {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[request.player];
    if (!Number.isFinite(f) || f <= 0) continue;
    for (const to of adjacency[nodeId] ?? []) {
      moveOptions.push({ from: nodeId, to, maxAmount: Math.floor(f) });
    }
  }

  const legal = {
    reinforce: { maxAmount: maxReinforce, costPerStrength: cost, supplyAfterIncome, incomeThisPly },
    moves: moveOptions.slice(0, 60),
    notes:
      "For moves: choose amount between 1 and maxAmount. Actions apply in order; later moves may use forces you moved earlier, even if not listed.",
  };

  const board = Object.entries(nodes)
    .map(([id, node]) => ({
      id,
      owner: typeof node?.owner === "string" ? node.owner : null,
      supplyYield: Number.isFinite(node?.supplyYield) ? Number(node.supplyYield) : 0,
      forces: {
        P1: Number.isFinite(node?.forces?.P1) ? Math.floor(Number(node.forces.P1)) : 0,
        P2: Number.isFinite(node?.forces?.P2) ? Math.floor(Number(node.forces.P2)) : 0,
      },
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const enemyHq = scenario.players[enemy].hq;
  const distToEnemyHq = bfsDistances(adjacency, enemyHq);
  const myHq = scenario.players[request.player].hq;
  const pathToEnemyHq = buildShortestPathTowardTarget(adjacency, distToEnemyHq, myHq);
  const resourceNodes = board.filter((n) => (n.supplyYield ?? 0) > 0).map((n) => n.id);
  const distToResource: Record<string, Record<string, number>> = {};
  for (const r of resourceNodes) distToResource[r] = bfsDistances(adjacency, r);
  const bestResource = resourceNodes
    .slice()
    .sort((a, b) => (distToResource[a]?.[myHq] ?? 999) - (distToResource[b]?.[myHq] ?? 999) || a.localeCompare(b))[0];
  const distToBestResource = bestResource ? distToResource[bestResource] ?? {} : {};
  const pathToBestResource = bestResource ? buildShortestPathTowardTarget(adjacency, distToBestResource, myHq) : [];

  const ownerById: Record<string, string | null> = {};
  for (const n of board) ownerById[n.id] = typeof n.owner === "string" ? n.owner : null;
  const safePrefix: string[] = [];
  for (const nodeId of pathToEnemyHq) {
    const owner = ownerById[nodeId] ?? null;
    if (owner === enemy) break;
    safePrefix.push(nodeId);
  }
  const safeEnemyStageTarget = safePrefix[safePrefix.length - 1] ?? null;
  const distToSafeStage = safeEnemyStageTarget ? bfsDistances(adjacency, safeEnemyStageTarget) : {};
  const pathToSafeStage = safeEnemyStageTarget ? buildShortestPathTowardTarget(adjacency, distToSafeStage, myHq) : [];

  const maxChain = Math.max(0, request.action_budget);
  const chainEdges = (path: string[]) =>
    path
      .slice(0, Math.min(path.length, maxChain + 1))
      .slice(0, -1)
      .map((from, i) => ({ from, to: path[i + 1]! }));

  const distMyHqToEnemyHq = distToEnemyHq[myHq];
  const canCaptureEnemyHqThisPly = Number.isInteger(distMyHqToEnemyHq) && distMyHqToEnemyHq <= maxChain;
  const myHqForces = Math.max(0, Math.floor(Number(nodes?.[myHq]?.forces?.[request.player] ?? 0)));
  const enemyHqDefenders = Math.max(0, Math.floor(Number(nodes?.[enemyHq]?.forces?.[enemy] ?? 0)));

  const chainMovesWithAmount = (path: string[], amount: number) =>
    chainEdges(path).map((e) => ({ ...e, amount: Math.max(1, Math.floor(amount)) }));

  const towardEnemyFrom = moveOptions
    .slice()
    .sort((a, b) => (distToEnemyHq[a.to] ?? 999) - (distToEnemyHq[b.to] ?? 999))
    .slice(0, 12);

  const info = {
    match_id: request.match_id,
    player: request.player,
    enemy,
    scenario_id: request.scenario_id,
    ply: request.ply,
    action_budget: request.action_budget,
    hq: { [request.player]: scenario.players[request.player].hq, [enemy]: scenario.players[enemy].hq },
    settings: {
      baseIncome: settings.baseIncome,
      reinforceCostPerStrength: settings.reinforceCostPerStrength,
      combatVarianceFraction: settings.combatVarianceFraction,
      turnCapPlies: settings.turnCapPlies,
    },
    supplies,
    legal,
    strategy: {
      enemyHq,
      myHq,
      distToEnemyHq,
      resourceNodes,
      bestResource,
      pathToEnemyHq,
      pathToBestResource,
      suggestedChains: {
        toBestResource: chainEdges(pathToBestResource),
        towardEnemyNoCombat: chainEdges(pathToSafeStage),
        winThisPly: canCaptureEnemyHqThisPly ? chainEdges(pathToEnemyHq) : [],
        winThisPlyMoveAll: canCaptureEnemyHqThisPly && myHqForces > 0 ? chainMovesWithAmount(pathToEnemyHq, myHqForces) : [],
      },
      towardEnemyFrom,
      note: canCaptureEnemyHqThisPly
        ? `You can attempt to capture enemyHq THIS PLY by following strategy.suggestedChains.winThisPlyMoveAll (amount=${myHqForces}). Enemy HQ defenders=${enemyHqDefenders}; do NOT send 1. Do NOT reinforce this ply (it wastes an action).`
        : "Shorter distance to enemyHq is usually better when attacking. Capturing enemyHq wins immediately.",
    },
    adjacency,
    board,
  };

  return [
    "Decide your actions for this ply.",
    "Return JSON only.",
    "Context:",
    JSON.stringify(info),
  ].join("\n");
}

function buildUserPrompt(params: {
  request: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
}) {
  const { request, scenario, adjacency } = params;
  const enemy = request.player === "P1" ? "P2" : "P1";
  const enemyHq = scenario.players[enemy].hq;
  const myHq = scenario.players[request.player].hq;
  const distToEnemyHq = bfsDistances(adjacency, enemyHq);
  const pathToEnemyHq = buildShortestPathTowardTarget(adjacency, distToEnemyHq, myHq);

  const settings = scenario.settings;
  const cost = settings.reinforceCostPerStrength ?? 1;
  const obs = request.observation ?? {};
  const supplies = obs.supplies ?? { P1: 0, P2: 0 };
  const playerSupply = Number.isFinite(supplies?.[request.player]) ? supplies[request.player] : 0;
  const baseIncome = settings.baseIncome ?? 0;
  const incomeThisPly = sumIncomeFromObservation(obs, request.player, baseIncome);
  const supplyAfterIncome = playerSupply + incomeThisPly;
  const maxReinforce = Math.max(0, Math.floor(supplyAfterIncome / cost));

  const moveOptions: Array<{ from: string; to: string; maxAmount: number }> = [];
  const nodes: Record<string, any> = obs.nodes ?? {};
  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[request.player];
    if (!Number.isFinite(f) || f <= 0) continue;
    for (const to of adjacency[nodeId] ?? []) {
      moveOptions.push({ from: nodeId, to, maxAmount: Math.floor(f) });
    }
  }

  const legal = {
    reinforce: { maxAmount: maxReinforce, costPerStrength: cost, supplyAfterIncome, incomeThisPly },
    moves: moveOptions.slice(0, 60),
    notes:
      "For moves: choose amount between 1 and maxAmount. Actions apply in order; later moves may use forces you moved earlier, even if not listed.",
  };

  const info = {
    match_id: request.match_id,
    player: request.player,
    enemy,
    scenario_id: request.scenario_id,
    ply: request.ply,
    action_budget: request.action_budget,
    hq: { [request.player]: scenario.players[request.player].hq, [enemy]: scenario.players[enemy].hq },
    settings: {
      baseIncome: settings.baseIncome,
      reinforceCostPerStrength: settings.reinforceCostPerStrength,
      combatVarianceFraction: settings.combatVarianceFraction,
      turnCapPlies: settings.turnCapPlies,
    },
    adjacency,
    legal,
    strategy: {
      enemyHq,
      myHq,
      distToEnemyHq,
      pathToEnemyHq,
      note: "Shorter distance to enemyHq is usually better when attacking. Capturing enemyHq wins immediately.",
    },
    observation: request.observation,
  };

  return [
    "Decide your actions for this ply.",
    "Return JSON only.",
    "Context:",
    JSON.stringify(info),
  ].join("\n");
}

const resolvedModelCache = new Map<string, string>();
const autoCandidateCache = new Map<string, string[]>();
const deniedAutoModels = new Map<string, Map<string, { untilMs: number; reason: string }>>();

const DEFAULT_OSS_BASELINES_CONFIG_PATH = "configs/oss_baselines.json";
const AUTO_MODEL_DENY_TTL_MS = 5 * 60 * 1000;

function getDeniedEntry(cacheKey: string, model: string): { untilMs: number; reason: string } | undefined {
  const byModel = deniedAutoModels.get(cacheKey);
  const e = byModel?.get(model);
  if (!e) return undefined;
  if (Date.now() >= e.untilMs) {
    byModel?.delete(model);
    return undefined;
  }
  return e;
}

function markAutoModelDenied(params: { cacheKey: string; model: string; reason: string }) {
  const { cacheKey, model, reason } = params;
  const untilMs = Date.now() + AUTO_MODEL_DENY_TTL_MS;
  const byModel = deniedAutoModels.get(cacheKey) ?? new Map<string, { untilMs: number; reason: string }>();
  byModel.set(model, { untilMs, reason });
  deniedAutoModels.set(cacheKey, byModel);
  // Ensure the next resolve doesn't keep returning a model we just denied.
  resolvedModelCache.delete(cacheKey);
}

function pickFirstHealthyAutoModel(cacheKey: string, candidates: string[]): string {
  for (const m of candidates) {
    if (!getDeniedEntry(cacheKey, m)) return m;
  }
  // If everything is denied, pick the best candidate anyway (avoid getting stuck).
  return candidates[0] ?? "";
}

function pickNextHealthyAutoModel(cacheKey: string, candidates: string[], afterIndex: number): { model: string; idx: number } | null {
  for (let i = Math.max(0, afterIndex + 1); i < candidates.length; i++) {
    const m = candidates[i]!;
    if (!getDeniedEntry(cacheKey, m)) return { model: m, idx: i };
  }
  return null;
}

function looksLikeModelUnavailableError(msg: string): boolean {
  const m = msg.toLowerCase();
  if (m.includes("no instances available")) return true;
  if (m.includes("no instance available")) return true;
  if (m.includes("no workers available")) return true;
  if (m.includes("no worker available")) return true;
  if (m.includes("model not found")) return true;
  if (m.includes("unknown model")) return true;
  if (m.includes("does not exist") && m.includes("model")) return true;
  // Chutes-specific pattern we see frequently in practice.
  if (m.startsWith("http 503") && m.includes("chute_id") && m.includes("no instances")) return true;
  return false;
}

function looksLikeReasoningTruncationWithoutAnswer(msg: string): boolean {
  // We see this pattern frequently for "thinking"/reasoning models on OpenAI-compatible OSS providers:
  // - content/tool_calls are empty
  // - model spent its budget on reasoning (sometimes hidden as reasoning_tokens with no reasoning text)
  // - sometimes finish_reason=length, but we also see finish_reason=stop with empty content.
  //
  // We only have the flattened error message string here, so use robust substring checks.
  const m = msg.toLowerCase();

  const contentEmpty =
    m.includes("content\":null") ||
    m.includes("content\":\"\"") ||
    m.includes("no message.content") ||
    m.includes("no message.content or tool_calls");
  if (!contentEmpty) return false;

  const hasReasoningSignal =
    m.includes("finish_reason=length") ||
    m.includes("native_finish_reason=max_output_tokens") ||
    m.includes("reasoning_tokens") ||
    m.includes("reasoning_content") ||
    (m.includes("messagekeys=[") && m.includes("reasoning"));
  return hasReasoningSignal;
}

type ToolsMode = "auto" | "force" | "off";

function parseToolsMode(params: { args: ProviderArgs }): ToolsMode {
  const raw = (params.args.get("--tools-mode") ?? process.env.ASG_OPENAI_TOOLS_MODE ?? "auto").toLowerCase();
  if (raw === "auto" || raw === "force" || raw === "off") return raw;
  throw new Error(`invalid --tools-mode '${raw}' (expected auto|force|off)`);
}

type StreamMode = "auto" | "on" | "off";

function parseStreamMode(params: { args: ProviderArgs }): StreamMode {
  const raw = (params.args.get("--stream") ?? process.env.ASG_OPENAI_STREAM ?? "auto").toLowerCase().trim();
  if (raw === "auto" || raw === "") return "auto";
  if (raw === "true" || raw === "1" || raw === "on" || raw === "yes") return "on";
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return "off";
  throw new Error(`invalid --stream '${raw}' (expected auto|on|off)`);
}

type ReasoningEffort = "low" | "medium" | "high";

function looksLikeReasoningModelId(modelId: string): boolean {
  const m = modelId.toLowerCase();
  return m.includes(":thinking") || m.includes("thinking") || m.includes("reasoning") || m.includes("deepseek-r1") || m.includes("deepseek_r1");
}

function parseReasoningEffort(params: { args: ProviderArgs; provider: string; resolvedModel: string }): ReasoningEffort | null {
  const raw = (params.args.get("--reasoning-effort") ?? process.env.ASG_OPENAI_REASONING_EFFORT ?? "").toLowerCase().trim();
  if (raw === "off" || raw === "false" || raw === "0" || raw === "none") return null;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (raw.length > 0) throw new Error(`invalid --reasoning-effort '${raw}' (expected low|medium|high|off)`);

  // Heuristic default: for "thinking"/reasoning models on OSS providers, request low effort to avoid
  // spending the entire output budget on chain-of-thought and never emitting the final JSON/tool call.
  // Avoid touching OpenRouter defaults (keep Grok stable).
  if (params.provider === "openrouter") return null;

  return looksLikeReasoningModelId(params.resolvedModel) ? "low" : null;
}

function parseIncludeReasoning(params: { args: ProviderArgs; provider: string }): boolean | null {
  const raw = (params.args.get("--include-reasoning") ?? process.env.ASG_OPENAI_INCLUDE_REASONING ?? "auto").toLowerCase().trim();
  if (raw === "auto" || raw === "") {
    // Keep OpenRouter behavior stable unless explicitly configured.
    if (params.provider === "openrouter") return null;
    // Default OFF elsewhere: reasoning output often consumes the whole output budget and prevents the final JSON/tool call.
    return false;
  }
  if (raw === "true" || raw === "1" || raw === "on" || raw === "yes") return true;
  if (raw === "false" || raw === "0" || raw === "off" || raw === "no") return false;
  throw new Error(`invalid --include-reasoning '${raw}' (expected auto|true|false)`);
}

async function resolveOpenAiCompatModel(params: {
  args: ProviderArgs;
  keys: Map<string, string>;
  keysName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<
  | { mode: "explicit"; resolvedModel: string }
  | { mode: "auto"; resolvedModel: string; cacheKey: string; candidates: string[] }
> {
  const { args, keys, keysName, baseUrl, apiKey } = params;
  const modelRaw = params.model;
  if (modelRaw !== "auto") return { mode: "explicit", resolvedModel: modelRaw };

  const modelsConfigPath =
    args.get("--models-config") ??
    process.env.ASG_MODELS_CONFIG ??
    DEFAULT_OSS_BASELINES_CONFIG_PATH;

  const modelsProvider = (
    args.get("--models-provider") ??
    args.get("--provider-name") ??
    process.env.ASG_OPENAI_PROVIDER ??
    keysName
  ).toLowerCase();

  const cacheKey = `${normalizeBaseUrl(baseUrl)}|${modelsProvider}|${modelsConfigPath}`;
  const cachedCandidates = autoCandidateCache.get(cacheKey);
  let candidates: string[] | undefined = cachedCandidates;
  if (!candidates) {
    const config = await loadOssModelsConfig(modelsConfigPath);
    const { priority, allow, deny, denyPrefixes } = getProviderAllowlist(config, modelsProvider);
    if (priority.length === 0 && allow.length === 0) {
      throw new Error(`model=auto has no allowlist for provider '${modelsProvider}' in ${modelsConfigPath}`);
    }

    const ids = await fetchOpenAiCompatModelIds({ baseUrl, apiKey });
    const available = new Set(ids);
    const denySet = new Set(deny);
    const denyPrefixesNorm = denyPrefixes.map((p) => p.toLowerCase());
    const candidateOrder = Array.from(new Set([...priority, ...allow])).filter((m) => {
      if (denySet.has(m)) return false;
      const lower = m.toLowerCase();
      if (denyPrefixesNorm.some((p) => lower.startsWith(p))) return false;
      return true;
    });
    candidates = candidateOrder.filter((m) => available.has(m));
    if (candidates.length === 0) {
      const sample = ids.slice(0, 30).join(", ");
      throw new Error(
        `model=auto could not find an allowed model for provider '${modelsProvider}' at ${normalizeBaseUrl(baseUrl)}; sample available models: ${sample}`,
      );
    }
    autoCandidateCache.set(cacheKey, candidates);
  }

  const cachedResolved = resolvedModelCache.get(cacheKey);
  const cachedOk = cachedResolved && candidates.includes(cachedResolved) && !getDeniedEntry(cacheKey, cachedResolved);
  const chosen = cachedOk ? cachedResolved! : pickFirstHealthyAutoModel(cacheKey, candidates);
  if (!chosen) throw new Error("model=auto internal error: no candidates");

  resolvedModelCache.set(cacheKey, chosen);
  return { mode: "auto", resolvedModel: chosen, cacheKey, candidates };
}

export async function openAiCompatAct(params: {
  request: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
  args: ProviderArgs;
}): Promise<{ response: AgentResponse; httpStatus: number; raw: unknown; resolvedModel: string; provider: string; baseUrl: string }> {
  const { request, scenario, adjacency, args } = params;

  const providerName = (args.get("--provider-name") ?? process.env.ASG_OPENAI_PROVIDER ?? "openai").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const keysFilePath = args.get("--keys-file");
  const keys = keysFilePath
    ? parseKeysFile(await (await import("node:fs/promises")).readFile(keysFilePath, "utf8"))
    : new Map<string, string>();
  const keysName = (args.get("--keys-name") ?? providerName.toLowerCase()).toLowerCase();

  const baseUrl =
    args.get("--base-url") ??
    process.env[`ASG_${providerName}_BASE_URL`] ??
    process.env.ASG_OPENAI_BASE_URL ??
    keys.get(`${keysName}_base_url`) ??
    "";
  const apiKey =
    args.get("--api-key") ??
    process.env[`ASG_${providerName}_API_KEY`] ??
    process.env.ASG_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY ??
    keys.get(keysName) ??
    "";
  let model =
    args.get("--model") ??
    process.env[`ASG_${providerName}_MODEL`] ??
    process.env.ASG_OPENAI_MODEL ??
    keys.get(`${keysName}_model`) ??
    "";
  // Default must accommodate typical remote OpenAI-compatible provider latency.
  const timeoutMs = Number.parseInt(args.get("--timeout-ms") ?? process.env.ASG_OPENAI_TIMEOUT_MS ?? "60000", 10);
  const temperature = Number.parseFloat(args.get("--temperature") ?? process.env.ASG_OPENAI_TEMPERATURE ?? "0");
  const maxTokens = Number.parseInt(args.get("--max-tokens") ?? process.env.ASG_OPENAI_MAX_TOKENS ?? "300", 10);
  const referer =
    args.get("--referer") ??
    process.env[`ASG_${providerName}_REFERER`] ??
    process.env.ASG_OPENAI_REFERER ??
    "";
  const title =
    args.get("--title") ??
    process.env[`ASG_${providerName}_TITLE`] ??
    process.env.ASG_OPENAI_TITLE ??
    "ASG";

  if (!baseUrl) throw new Error("openai_compat requires --base-url (e.g. https://openrouter.ai/api/v1)");
  if (!apiKey) throw new Error("openai_compat requires --api-key (or ASG_OPENAI_API_KEY/OPENAI_API_KEY)");
  if (!model) {
    const baseUrlNorm = baseUrl ? normalizeBaseUrl(baseUrl) : "";
    if (keysName === "openrouter" || baseUrlNorm.includes("openrouter.ai")) {
      model = "x-ai/grok-4.1-fast";
    }
  }
  if (!model) throw new Error("openai_compat requires --model (or set it to 'auto')");

  const resolved = await resolveOpenAiCompatModel({
    args,
    keys,
    keysName,
    baseUrl,
    apiKey,
    model,
  });
  const autoCacheKey = resolved.mode === "auto" ? resolved.cacheKey : undefined;
  const autoCandidates = resolved.mode === "auto" ? resolved.candidates : undefined;
  let resolvedModel = resolved.resolvedModel;
  let autoCandidateIdx =
    autoCacheKey && autoCandidates ? Math.max(0, autoCandidates.findIndex((m) => m === resolvedModel)) : 0;

  const url = normalizeBaseUrl(baseUrl) + "/chat/completions";

  const thinkSec = Math.max(1, Math.floor((timeoutMs - 5000) / 1000));
  const system = shouldAddThinkingHint({ args })
    ? [
        buildSystemPrompt(),
        "Think carefully and aim for an optimal strategy.",
        `You have up to ${thinkSec} seconds before timeout, but do not use it all; respond as soon as you have a plan (target a few seconds) and output JSON only.`,
      ].join("\n")
    : buildSystemPrompt();
  const promptMode = (args.get("--prompt-mode") ?? process.env.ASG_OPENAI_PROMPT_MODE ?? "compact").toLowerCase();
  if (promptMode !== "full" && promptMode !== "compact") {
    throw new Error(`invalid --prompt-mode '${promptMode}' (expected full|compact)`);
  }
  const user =
    promptMode === "compact"
      ? buildUserPromptCompact({ request, scenario, adjacency })
      : buildUserPrompt({ request, scenario, adjacency });

  const payload: any = {
    model: resolvedModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 300,
    // Many OpenAI-compatible providers support this; if ignored, we still parse best-effort.
    // Note: some providers behave better with forced tool calling when response_format is omitted.
    response_format: { type: "json_object" },
  };

  const toolsModeArg = parseToolsMode({ args });
  const includeReasoning = parseIncludeReasoning({ args, provider: keysName });
  if (typeof includeReasoning === "boolean") payload.include_reasoning = includeReasoning;
  const streamMode = parseStreamMode({ args });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  // Enforce a total wall-clock budget across retries so the agent server responds
  // within the configured timeout window (instead of timing out after multiple attempts).
  const deadlineAt = Date.now() + timeoutMs;
  // For heavy "thinking"/reasoning models we often see an initial hang/slow response. Reserve a slice of time
  // for at least one retry, rather than letting the first request consume the entire wall-clock budget.
  const reserveRetryMs = looksLikeReasoningModelId(resolvedModel) ? Math.min(15_000, Math.floor(timeoutMs * 0.25)) : 0;
  let callOnceCount = 0;

  async function sleep(ms: number) {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, remainingMs)));
  }

  async function callOnce(
    extraUserLine?: string,
    maxTokensOverride?: number,
    toolsModeOverride?: ToolsMode,
    useToolsOverride?: boolean,
    omitReasoningEffort?: boolean,
    omitResponseFormat?: boolean,
    omitIncludeReasoning?: boolean,
    modelOverride?: string,
  ): Promise<{ response: AgentResponse; httpStatus: number; raw: unknown }> {
    const attemptIdx = callOnceCount++;
    const remainingMs = deadlineAt - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs < 1000) throw new Error("timeout_budget_exhausted");
    let attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, Math.floor(remainingMs)));
    if (attemptIdx === 0 && reserveRetryMs > 0) {
      const remainingInt = Math.floor(remainingMs);
      const reserved = Math.min(reserveRetryMs, Math.max(0, remainingInt - 1000));
      const capped = remainingInt - reserved;
      if (capped >= 1000) attemptTimeoutMs = Math.min(attemptTimeoutMs, capped);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    let httpStatus = 0;
    let raw: unknown = undefined;

    try {
      const p: any = { ...payload };
      const modelForAttempt = modelOverride ?? resolvedModel;
      p.model = modelForAttempt;
      if (omitReasoningEffort) delete p.reasoning_effort;
      if (omitResponseFormat) delete p.response_format;
      if (omitIncludeReasoning) delete p.include_reasoning;
      if (!omitReasoningEffort) {
        const effort = parseReasoningEffort({ args, provider: keysName, resolvedModel: modelForAttempt });
        if (effort) p.reasoning_effort = effort;
      }

      // Prefer tools/function-call when supported (reduces malformed JSON output),
      // but some providers/models reject forced function calling.
      const useToolsArg = (params.args.get("--use-tools") ?? process.env.ASG_OPENAI_USE_TOOLS ?? "true").toLowerCase() !== "false";
      const toolsMode = toolsModeOverride ?? toolsModeArg;
      const useTools =
        toolsMode === "off" ? false : typeof useToolsOverride === "boolean" ? useToolsOverride : useToolsArg;
      if (useTools) {
        p.tools = buildToolSchema();
        if (toolsMode === "force") {
          // Default: force tool call to reduce malformed JSON.
          p.tool_choice = { type: "function", function: { name: "act" } };
          // If we're forcing a tool call, the tool args are already structured JSON; some providers
          // fail to emit tool_calls when response_format is also set.
          delete p.response_format;
        }
      }

      if (maxTokensOverride !== undefined && Number.isFinite(maxTokensOverride)) {
        p.max_tokens = Math.max(1, Math.floor(maxTokensOverride));
      }

      const maxTokensForAttempt = Number.isFinite(p.max_tokens) ? Number(p.max_tokens) : maxTokens;
      const wantsStream =
        streamMode === "on" ||
        (streamMode === "auto" && (looksLikeReasoningModelId(modelForAttempt) || maxTokensForAttempt >= 800));
      if (wantsStream) p.stream = true;

      if (extraUserLine) {
        p.messages = p.messages.slice();
        p.messages.push({ role: "user", content: extraUserLine });
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(p),
        signal: controller.signal,
      });

      httpStatus = res.status;
      const contentType = res.headers.get("content-type") ?? "";

      // Streaming early-stop: parse SSE chunks and abort as soon as we have a valid JSON/tool response.
      if (p.stream && contentType.toLowerCase().includes("event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let contentText = "";
        let reasoningText = "";
        const toolArgsByIndex = new Map<number, string>();
        let finishReason: string | undefined = undefined;
        let nativeFinishReason: string | undefined = undefined;
        let rawSnippet = "";
        const MAX_SNIPPET = 50_000;
        const MAX_ACC = 200_000;

        const tryReturn = (candidate: unknown): { response: AgentResponse; httpStatus: number; raw: unknown } | null => {
          try {
            const response = validateAgentResponse(candidate, request.api_version);
            return {
              response,
              httpStatus,
              raw: { status: res.status, body: rawSnippet, streamed: true },
            };
          } catch {
            return null;
          }
        };

        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            if (rawSnippet.length < MAX_SNIPPET) rawSnippet += chunk.slice(0, MAX_SNIPPET - rawSnippet.length);
            buf += chunk;

            while (true) {
              let idx = buf.indexOf("\n\n");
              let delimLen = 2;
              const idx2 = buf.indexOf("\r\n\r\n");
              if (idx2 >= 0 && (idx < 0 || idx2 < idx)) {
                idx = idx2;
                delimLen = 4;
              }
              if (idx < 0) break;
              const event = buf.slice(0, idx);
              buf = buf.slice(idx + delimLen);

              const lines = event.split(/\r?\n/);
              const dataLines: string[] = [];
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                dataLines.push(trimmed.slice(5).trim());
              }
              const data = dataLines.join("\n").trim();
              if (!data) continue;
              if (data === "[DONE]") {
                buf = "";
                break;
              }

              let chunkJson: any;
              try {
                chunkJson = JSON.parse(data);
              } catch {
                continue;
              }
              const choice0 = chunkJson?.choices?.[0];
              if (choice0?.finish_reason || choice0?.finishReason) finishReason = choice0.finish_reason ?? choice0.finishReason;
              if (choice0?.native_finish_reason || choice0?.nativeFinishReason) {
                nativeFinishReason = choice0.native_finish_reason ?? choice0.nativeFinishReason;
              }

              const delta = choice0?.delta ?? choice0?.message ?? {};
              const deltaContent = delta?.content ?? delta?.text ?? delta?.value ?? undefined;
              if (typeof deltaContent === "string" && deltaContent.length > 0 && contentText.length < MAX_ACC) {
                contentText += deltaContent.slice(0, MAX_ACC - contentText.length);
              }

              const deltaReasoning =
                delta?.reasoning_content ??
                delta?.reasoning ??
                delta?.reasoning_text ??
                delta?.reasoningText ??
                delta?.analysis ??
                undefined;
              if (typeof deltaReasoning === "string" && deltaReasoning.length > 0 && reasoningText.length < MAX_ACC) {
                reasoningText += deltaReasoning.slice(0, MAX_ACC - reasoningText.length);
              }

              const deltaToolCalls = delta?.tool_calls ?? delta?.toolCalls;
              if (Array.isArray(deltaToolCalls)) {
                for (const tc of deltaToolCalls) {
                  const tcIdx = Number.isInteger(tc?.index) ? Number(tc.index) : 0;
                  const part = tc?.function?.arguments;
                  if (typeof part === "string" && part.length > 0) {
                    const prev = toolArgsByIndex.get(tcIdx) ?? "";
                    if (prev.length < MAX_ACC) toolArgsByIndex.set(tcIdx, prev + part.slice(0, MAX_ACC - prev.length));
                  }
                }
              }

              const deltaFnArgs = delta?.function_call?.arguments;
              if (typeof deltaFnArgs === "string" && deltaFnArgs.length > 0) {
                const prev = toolArgsByIndex.get(0) ?? "";
                if (prev.length < MAX_ACC) toolArgsByIndex.set(0, prev + deltaFnArgs.slice(0, MAX_ACC - prev.length));
              }

              const tool0 = toolArgsByIndex.get(0);
              if (tool0) {
                const parsed = tryExtractCompleteJsonObject(tool0);
                if (parsed) {
                  const maybe = tryReturn(parsed);
                  if (maybe) {
                    try {
                      await reader.cancel();
                    } catch {
                      // ignore
                    }
                    return maybe;
                  }
                }
              }
              if (contentText) {
                const parsed = tryExtractCompleteJsonObject(contentText);
                if (parsed) {
                  const maybe = tryReturn(parsed);
                  if (maybe) {
                    try {
                      await reader.cancel();
                    } catch {
                      // ignore
                    }
                    return maybe;
                  }
                }
              }
              if (reasoningText && (reasoningText.includes("{") || reasoningText.includes("\"actions\""))) {
                const parsed = tryExtractCompleteJsonObject(reasoningText);
                if (parsed) {
                  const maybe = tryReturn(parsed);
                  if (maybe) {
                    try {
                      await reader.cancel();
                    } catch {
                      // ignore
                    }
                    return maybe;
                  }
                }
              }
            }
          }
        } finally {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
        }

        // End-of-stream fallback parsing (best-effort).
        raw = { status: res.status, body: rawSnippet, streamed: true };

        const tool0 = toolArgsByIndex.get(0);
        if (tool0 && tool0.length > 0) {
          const extracted = extractJsonObject(tool0);
          const response = validateAgentResponse(extracted, request.api_version);
          return { response, httpStatus, raw };
        }
        if (contentText && contentText.length > 0) {
          const extracted = extractJsonObject(contentText);
          const response = validateAgentResponse(extracted, request.api_version);
          return { response, httpStatus, raw };
        }

        throw new Error(
          `empty_output (finish_reason=${finishReason ?? ""} native_finish_reason=${nativeFinishReason ?? ""}) (choiceKeys=[] messageKeys=[] bodySnippet=${String(
            rawSnippet,
          )
            .replace(/\s+/g, " ")
            .slice(0, 600)})`,
        );
      }

      const text = await res.text();
      raw = { status: res.status, body: text };
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);

      const json = JSON.parse(text) as any;
      const msg = json?.choices?.[0]?.message;

      const toolArgs = msg?.tool_calls?.[0]?.function?.arguments;
      if (typeof toolArgs === "string" && toolArgs.length > 0) {
        const extracted = extractJsonObject(toolArgs);
        const response = validateAgentResponse(extracted, request.api_version);
        return { response, httpStatus, raw };
      }

      // Some OpenAI-compatible providers still emit the legacy function_call field.
      const functionCallArgs = msg?.function_call?.arguments;
      if (typeof functionCallArgs === "string" && functionCallArgs.length > 0) {
        const extracted = extractJsonObject(functionCallArgs);
        const response = validateAgentResponse(extracted, request.api_version);
        return { response, httpStatus, raw };
      }
      if (isObject(functionCallArgs)) {
        const response = validateAgentResponse(functionCallArgs, request.api_version);
        return { response, httpStatus, raw };
      }

      const content = msg?.content;
      if (typeof content === "string" && content.length > 0) {
        const extracted = extractJsonObject(content);
        const response = validateAgentResponse(extracted, request.api_version);
        return { response, httpStatus, raw };
      }
      if (Array.isArray(content) && content.length > 0) {
        const textParts = content
          .map((p: any) => p?.text ?? p?.content ?? p?.value ?? "")
          .filter((s: any) => typeof s === "string" && s.length > 0);
        const joined = textParts.join("\n");
        if (joined.length > 0) {
          const extracted = extractJsonObject(joined);
          const response = validateAgentResponse(extracted, request.api_version);
          return { response, httpStatus, raw };
        }
      }

      // Some providers/models emit the primary text in a separate reasoning field.
      // Prefer parsing it ONLY if it likely contains the final JSON object.
      const reasoningText =
        msg?.reasoning_content ??
        msg?.reasoning ??
        msg?.reasoning_text ??
        msg?.reasoningText ??
        msg?.analysis ??
        undefined;
      if (typeof reasoningText === "string" && reasoningText.length > 0) {
        const looksLikeJson =
          reasoningText.trimStart().startsWith("{") ||
          (reasoningText.includes("{") && (reasoningText.includes("\"actions\"") || reasoningText.includes("'actions'")));
        if (looksLikeJson) {
          const extracted = extractJsonObject(reasoningText);
          const response = validateAgentResponse(extracted, request.api_version);
          return { response, httpStatus, raw };
        }
      }

      const choice0 = json?.choices?.[0];
      const finishReason = choice0?.finish_reason ?? choice0?.finishReason;
      const nativeFinishReason = choice0?.native_finish_reason ?? choice0?.nativeFinishReason;
      const choiceKeys = isObject(choice0) ? Object.keys(choice0).slice(0, 30).join(",") : "";
      const msgKeys = isObject(msg) ? Object.keys(msg).slice(0, 30).join(",") : "";
      const snippet = typeof text === "string" ? text.replace(/\s+/g, " ").slice(0, 600) : "";
      throw new Error(
        `empty_output (finish_reason=${finishReason ?? ""} native_finish_reason=${nativeFinishReason ?? ""}) (choiceKeys=[${choiceKeys}] messageKeys=[${msgKeys}] bodySnippet=${snippet})`,
      );

    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    // First attempt.
    const first = await callOnce();
    return { ...first, resolvedModel, provider: keysName, baseUrl };
  } catch (e1) {
    // One retry for malformed JSON / parsing issues.
    const msg = e1 instanceof Error ? e1.message : String(e1);
    const isEmptyResponse =
      msg.toLowerCase().includes("\"code\":\"empty_response\"") ||
      msg.toLowerCase().includes("code\":\"empty_response\"") ||
      msg.toLowerCase().includes("code=empty_response") ||
      msg.toLowerCase().includes("empty_response") ||
      msg.toLowerCase().includes("empty_output");
    const gotLengthCutoff = msg.includes("finish_reason=length") || msg.includes("native_finish_reason=max_output_tokens");
    const likelyThinkingWithoutFinal = looksLikeReasoningTruncationWithoutAnswer(msg);
    const likelyBudgetEmpty = likelyThinkingWithoutFinal || isEmptyResponse;
    const seemsGlmModel = msg.toLowerCase().includes("glm");
    const isTransientHttp =
      !isEmptyResponse &&
      (msg.startsWith("HTTP 408") ||
        msg.startsWith("HTTP 425") ||
        msg.startsWith("HTTP 429") ||
        msg.startsWith("HTTP 500") ||
        msg.startsWith("HTTP 502") ||
        msg.startsWith("HTTP 503") ||
        msg.startsWith("HTTP 504"));
    const isTimeouty =
      msg.includes("timeout_budget_exhausted") ||
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("aborterror") ||
      msg.toLowerCase().includes("timed out") ||
      msg.toLowerCase().includes("timeout");

    const rejectsReasoningEffort =
      msg.startsWith("HTTP 400") &&
      (msg.toLowerCase().includes("reasoning_effort") ||
        msg.toLowerCase().includes("unknown field") ||
        msg.toLowerCase().includes("unrecognized") ||
        msg.toLowerCase().includes("invalid") && msg.toLowerCase().includes("reasoning"));

    const rejectsResponseFormat =
      msg.startsWith("HTTP 400") &&
      (msg.toLowerCase().includes("response_format") ||
        msg.toLowerCase().includes("response_mime_type") ||
        msg.toLowerCase().includes("json_object"));

    const rejectsIncludeReasoning =
      msg.startsWith("HTTP 400") &&
      (msg.toLowerCase().includes("include_reasoning") ||
        msg.toLowerCase().includes("include-reasoning"));

    const wantsToolsOff =
      msg.includes("HTTP 400") &&
      (msg.toLowerCase().includes("forced function calling") ||
        msg.toLowerCase().includes("function_calling_config") ||
        msg.toLowerCase().includes("tool_config") ||
        msg.toLowerCase().includes("response_mime_type"));
    const shouldRetry =
      msg.includes("JSON") ||
      msg.includes("Unexpected") ||
      msg.includes("Expected ','") ||
      msg.includes("empty_output") ||
      msg.includes("no message.content") ||
      msg.includes("no message.content or tool_calls") ||
      msg.includes("no JSON object found") ||
      wantsToolsOff ||
      isTransientHttp ||
      isTimeouty ||
      rejectsReasoningEffort ||
      rejectsResponseFormat ||
      rejectsIncludeReasoning;
    if (!shouldRetry) throw new Error(`openai_compat failed: ${msg}`);

    try {
      // If we're in model=auto mode and the chosen model is clearly failing (unavailable/timeout/budget-empty),
      // try the next best OSS baseline before other retries.
      if (autoCacheKey && autoCandidates && (looksLikeModelUnavailableError(msg) || isTimeouty || likelyBudgetEmpty)) {
        let lastMsg = msg;
        let current = resolvedModel;
        let idx = autoCandidateIdx;
        for (let attempts = 0; attempts < autoCandidates.length; attempts++) {
          const next = pickNextHealthyAutoModel(autoCacheKey, autoCandidates, idx);
          if (!next) break;
          markAutoModelDenied({ cacheKey: autoCacheKey, model: current, reason: lastMsg });
          current = next.model;
          idx = next.idx;
          autoCandidateIdx = idx;
          resolvedModel = current;
          resolvedModelCache.set(autoCacheKey, resolvedModel);
          try {
            const retry = await callOnce(
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              rejectsResponseFormat ? true : undefined,
              rejectsIncludeReasoning ? true : undefined,
              resolvedModel,
            );
            return { ...retry, resolvedModel, provider: keysName, baseUrl };
          } catch (e) {
            lastMsg = e instanceof Error ? e.message : String(e);
            const lastBudgetEmpty =
              looksLikeReasoningTruncationWithoutAnswer(lastMsg) ||
              lastMsg.toLowerCase().includes("\"code\":\"empty_response\"") ||
              lastMsg.toLowerCase().includes("empty_response");
            if (
              !(
                looksLikeModelUnavailableError(lastMsg) ||
                lastBudgetEmpty ||
                lastMsg.toLowerCase().includes("timeout") ||
                lastMsg.toLowerCase().includes("aborted")
              )
            ) {
              break;
            }
          }
        }
      }

      if (isTransientHttp) {
        let lastMsg = msg;
        for (let i = 0; i < 3; i++) {
          await sleep(500 * 2 ** i);
          try {
            const retry = await callOnce(
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              rejectsResponseFormat ? true : undefined,
              rejectsIncludeReasoning ? true : undefined,
              undefined,
            );
            return { ...retry, resolvedModel, provider: keysName, baseUrl };
          } catch (e) {
            lastMsg = e instanceof Error ? e.message : String(e);
            const stillTransient =
              lastMsg.startsWith("HTTP 408") ||
              lastMsg.startsWith("HTTP 425") ||
              lastMsg.startsWith("HTTP 429") ||
              lastMsg.startsWith("HTTP 500") ||
              lastMsg.startsWith("HTTP 502") ||
              lastMsg.startsWith("HTTP 503") ||
              lastMsg.startsWith("HTTP 504");
            if (!stillTransient) throw e;
          }
        }
        throw new Error(lastMsg);
      }

      const wantsMoreTokens =
        gotLengthCutoff ||
        msg.includes("max_output_tokens") ||
        msg.toLowerCase().includes("very low max_tokens") ||
        msg.toLowerCase().includes("low max_tokens");
      // If a model burned the whole budget on reasoning (or the provider explicitly reports "empty_response" / low max_tokens),
      // retry with a larger output budget + stronger instruction to emit JSON immediately.
      const bumpedMaxTokens = wantsMoreTokens
        ? likelyBudgetEmpty
          ? 4000
          : Math.min(8000, Math.max(1200, maxTokens * 4))
        : undefined;

      // Forced tool calling seems to encourage some "thinking" models to produce long reasoning and never reach the tool call.
      // On retry, prefer allowing either a tool call or direct JSON content.
      const toolsModeOverride: ToolsMode | undefined = wantsToolsOff
        ? "off"
        : likelyBudgetEmpty || isTimeouty
          ? "auto"
          : undefined;

      const useToolsOverride = wantsToolsOff ? false : undefined;
      const omitResponseFormatRetry = rejectsResponseFormat || likelyBudgetEmpty || (seemsGlmModel && msg.toLowerCase().includes("empty_output"));
      const retryLine = likelyBudgetEmpty
        ? `Your previous output was empty/truncated. Output ONLY the JSON object now. No reasoning, no extra text. Start with '{' (no whitespace before it) and end with '}'. api_version must be "${request.api_version}".`
        : `Your previous output was invalid/empty or not parseable. Do NOT explain. Start your response with '{' and return ONLY a single valid JSON object matching the schema exactly. api_version must be "${request.api_version}".`;
      try {
        const retry = await callOnce(
          retryLine,
          bumpedMaxTokens,
          toolsModeOverride,
          useToolsOverride,
          rejectsReasoningEffort ? true : undefined,
          omitResponseFormatRetry ? true : undefined,
          rejectsIncludeReasoning ? true : undefined,
          undefined,
        );
        return { ...retry, resolvedModel, provider: keysName, baseUrl };
      } catch (eRetry) {
        // Some "thinking" models still produce no final content/tool call on the first retry.
        // If we still see the same "budget empty" pattern and have time left, try once more with a larger budget.
        if (likelyBudgetEmpty) {
          const msgRetry = eRetry instanceof Error ? eRetry.message : String(eRetry);
          const stillBudgetEmpty =
            looksLikeReasoningTruncationWithoutAnswer(msgRetry) ||
            msgRetry.toLowerCase().includes("\"code\":\"empty_response\"") ||
            msgRetry.toLowerCase().includes("empty_response") ||
            msgRetry.toLowerCase().includes("empty_output");
          if (stillBudgetEmpty) {
            const toolsModeOverride2: ToolsMode | undefined = toolsModeOverride === "off" ? "off" : "force";
            const retry2 = await callOnce(
              `Your previous output was still empty/truncated. Output ONLY the JSON object now. No reasoning, no extra text. Start with '{' and end with '}'. api_version must be "${request.api_version}".`,
              8000,
              toolsModeOverride2,
              useToolsOverride,
              rejectsReasoningEffort ? true : undefined,
              omitResponseFormatRetry ? true : undefined,
              rejectsIncludeReasoning ? true : undefined,
              undefined,
            );
            return { ...retry2, resolvedModel, provider: keysName, baseUrl };
          }
        }
        throw eRetry;
      }
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`openai_compat failed: ${msg2}`);
    }
  }
}
