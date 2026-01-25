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
    "You must respond with JSON ONLY and no extra text.",
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
    "If unsure, return pass.",
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
    observation: request.observation,
  };

  return [
    "Decide your actions for this ply.",
    "Return JSON only.",
    "Context:",
    JSON.stringify(info),
  ].join("\n");
}

export async function openAiCompatAct(params: {
  request: AgentRequest;
  scenario: Scenario;
  adjacency: Record<string, string[]>;
  args: ProviderArgs;
}): Promise<{ response: AgentResponse; httpStatus: number; raw: unknown }> {
  const { request, scenario, adjacency, args } = params;

  const providerName = (args.get("--provider-name") ?? process.env.ASG_OPENAI_PROVIDER ?? "openai").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const baseUrl =
    args.get("--base-url") ??
    process.env[`ASG_${providerName}_BASE_URL`] ??
    process.env.ASG_OPENAI_BASE_URL ??
    "";
  const apiKey =
    args.get("--api-key") ??
    process.env[`ASG_${providerName}_API_KEY`] ??
    process.env.ASG_OPENAI_API_KEY ??
    process.env.OPENAI_API_KEY ??
    "";
  const model =
    args.get("--model") ??
    process.env[`ASG_${providerName}_MODEL`] ??
    process.env.ASG_OPENAI_MODEL ??
    "";
  const timeoutMs = Number.parseInt(args.get("--timeout-ms") ?? process.env.ASG_OPENAI_TIMEOUT_MS ?? "8000", 10);
  const temperature = Number.parseFloat(args.get("--temperature") ?? process.env.ASG_OPENAI_TEMPERATURE ?? "0.2");
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
  if (!model) throw new Error("openai_compat requires --model");

  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";

  const system = buildSystemPrompt();
  const user = buildUserPrompt({ request, scenario, adjacency });

  const payload: any = {
    model,
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
    return { response, httpStatus, raw };
  } catch (e) {
    clearTimeout(timeout);
    const err = e instanceof Error ? e.message : String(e);
    throw new Error(`openai_compat failed: ${err}`);
  }
}
