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

function validateAgentResponse(json: unknown, expectedApiVersion: string): AgentResponse {
  if (!isObject(json)) throw new Error("model output must be a JSON object");
  const apiVersion = json.api_version;
  if (typeof apiVersion !== "string" || apiVersion.length === 0) throw new Error("api_version missing");
  if (apiVersion !== expectedApiVersion) throw new Error(`api_version mismatch: got ${apiVersion}, expected ${expectedApiVersion}`);
  if (!Array.isArray(json.actions)) throw new Error("actions must be an array");
  const actions = json.actions as Action[];
  const rationale_text = typeof json.rationale_text === "string" ? json.rationale_text : undefined;
  return { api_version: apiVersion, actions, rationale_text };
}

function buildSystemPrompt() {
  return [
    "You are an agent that plays a deterministic, turn-based strategy game.",
    "You must respond with VALID JSON ONLY (no markdown, no code fences, no commentary).",
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
    "Rules reminders:",
    "- move only along an edge from the provided adjacency list.",
    "- do not exceed available forces at the from node.",
    "- reinforce costs supply: amount * reinforceCostPerStrength.",
    "If unsure, prefer: reinforce 1 (if affordable), else move 1 toward enemy HQ, else pass.",
    "Strategy guideline (good enough):",
    "- If you can capture enemy HQ soon, do it.",
    "- Otherwise, expand to adjacent neutral/enemy nodes with higher supplyYield.",
    "- Reinforce HQ when you have spare supply.",
    "Keep rationale_text short (<= 1 sentence) or omit it.",
  ].join("\n");
}

function buildUserPrompt(params: {
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
  const maxReinforce = Math.max(0, Math.floor(playerSupply / cost));

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
    reinforce: { maxAmount: maxReinforce, costPerStrength: cost },
    moves: moveOptions.slice(0, 120),
    notes: "For moves: choose amount between 1 and maxAmount.",
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

async function resolveOpenAiCompatModel(params: {
  args: ProviderArgs;
  keys: Map<string, string>;
  keysName: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<string> {
  const { args, keys, keysName, baseUrl, apiKey } = params;
  const modelRaw = params.model;
  if (modelRaw !== "auto") return modelRaw;

  const modelsConfigPath =
    args.get("--models-config") ??
    process.env.ASG_MODELS_CONFIG ??
    "configs/oss_models.json";

  const modelsProvider = (
    args.get("--models-provider") ??
    args.get("--provider-name") ??
    process.env.ASG_OPENAI_PROVIDER ??
    keysName
  ).toLowerCase();

  const cacheKey = `${normalizeBaseUrl(baseUrl)}|${modelsProvider}|${modelsConfigPath}`;
  const cached = resolvedModelCache.get(cacheKey);
  if (cached) return cached;

  const config = await loadOssModelsConfig(modelsConfigPath);
  const { priority, allow } = getProviderAllowlist(config, modelsProvider);
  if (priority.length === 0 && allow.length === 0) {
    throw new Error(`model=auto has no allowlist for provider '${modelsProvider}' in ${modelsConfigPath}`);
  }

  const ids = await fetchOpenAiCompatModelIds({ baseUrl, apiKey });
  const available = new Set(ids);
  const candidateOrder = Array.from(new Set([...priority, ...allow]));
  const chosen = candidateOrder.find((m) => available.has(m));
  if (!chosen) {
    const sample = ids.slice(0, 30).join(", ");
    throw new Error(
      `model=auto could not find an allowed model for provider '${modelsProvider}' at ${normalizeBaseUrl(baseUrl)}; sample available models: ${sample}`,
    );
  }

  resolvedModelCache.set(cacheKey, chosen);
  return chosen;
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
  const model =
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
  if (!model) throw new Error("openai_compat requires --model (or set it to 'auto')");

  const resolvedModel = await resolveOpenAiCompatModel({
    args,
    keys,
    keysName,
    baseUrl,
    apiKey,
    model,
  });

  const url = normalizeBaseUrl(baseUrl) + "/chat/completions";

  const system = buildSystemPrompt();
  const user = buildUserPrompt({ request, scenario, adjacency });

  const payload: any = {
    model: resolvedModel,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: Number.isFinite(temperature) ? temperature : 0.2,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 300,
    // Many OpenAI-compatible providers support this; if ignored, we still parse best-effort.
    response_format: { type: "json_object" },
  };

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let httpStatus = 0;
  let raw: unknown = undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    httpStatus = res.status;
    const text = await res.text();
    raw = { status: res.status, body: text };
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);

    const json = JSON.parse(text) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) throw new Error("no choices[0].message.content");

    const extracted = extractJsonObject(content);
    const response = validateAgentResponse(extracted, request.api_version);
    return { response, httpStatus, raw, resolvedModel, provider: keysName, baseUrl };
  } catch (e) {
    clearTimeout(timeout);
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`openai_compat failed: ${err}`);
  }
}
