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
  const apiVersionRaw = (json as any).api_version;
  // Some models omit or corrupt api_version; treat it as metadata and force the expected version.
  const apiVersion = expectedApiVersion;
  if (!Array.isArray(json.actions)) throw new Error("actions must be an array");
  const actions = json.actions as Action[];
  const rationale_text = typeof json.rationale_text === "string" ? json.rationale_text : undefined;
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
    "If unsure or you cannot find a legal action, return pass.",
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

type ToolsMode = "auto" | "force" | "off";

function parseToolsMode(params: { args: ProviderArgs }): ToolsMode {
  const raw = (params.args.get("--tools-mode") ?? process.env.ASG_OPENAI_TOOLS_MODE ?? "auto").toLowerCase();
  if (raw === "auto" || raw === "force" || raw === "off") return raw;
  throw new Error(`invalid --tools-mode '${raw}' (expected auto|force|off)`);
}

type ReasoningEffort = "low" | "medium" | "high";

function parseReasoningEffort(params: { args: ProviderArgs; provider: string; resolvedModel: string }): ReasoningEffort | null {
  const raw = (params.args.get("--reasoning-effort") ?? process.env.ASG_OPENAI_REASONING_EFFORT ?? "").toLowerCase().trim();
  if (raw === "off" || raw === "false" || raw === "0" || raw === "none") return null;
  if (raw === "low" || raw === "medium" || raw === "high") return raw;
  if (raw.length > 0) throw new Error(`invalid --reasoning-effort '${raw}' (expected low|medium|high|off)`);

  // Heuristic default: for "thinking"/reasoning models on OSS providers, request low effort to avoid
  // spending the entire output budget on chain-of-thought and never emitting the final JSON/tool call.
  // Avoid touching OpenRouter defaults (keep Grok stable).
  if (params.provider === "openrouter") return null;

  const m = params.resolvedModel.toLowerCase();
  const looksLikeReasoningModel =
    m.includes(":thinking") || m.includes("thinking") || m.includes("reasoning") || m.includes("deepseek-r1") || m.includes("deepseek_r1");
  return looksLikeReasoningModel ? "low" : null;
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

  const resolvedModel = await resolveOpenAiCompatModel({
    args,
    keys,
    keysName,
    baseUrl,
    apiKey,
    model,
  });

  const url = normalizeBaseUrl(baseUrl) + "/chat/completions";

  const thinkSec = Math.max(1, Math.floor((timeoutMs - 5000) / 1000));
  const system = shouldAddThinkingHint({ args })
    ? [
        buildSystemPrompt(),
        "Think carefully and aim for an optimal strategy.",
        `You have up to ${thinkSec} seconds before timeout, but do not use it all; respond as soon as you have a plan (target a few seconds) and output JSON only.`,
      ].join("\n")
    : buildSystemPrompt();
  const promptMode = (args.get("--prompt-mode") ?? process.env.ASG_OPENAI_PROMPT_MODE ?? "full").toLowerCase();
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
  const reasoningEffort = parseReasoningEffort({ args, provider: keysName, resolvedModel });
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;
  const includeReasoning = parseIncludeReasoning({ args, provider: keysName });
  if (typeof includeReasoning === "boolean") payload.include_reasoning = includeReasoning;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  // Enforce a total wall-clock budget across retries so the agent server responds
  // within the configured timeout window (instead of timing out after multiple attempts).
  const deadlineAt = Date.now() + timeoutMs;

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
  ): Promise<{ response: AgentResponse; httpStatus: number; raw: unknown }> {
    const remainingMs = deadlineAt - Date.now();
    if (!Number.isFinite(remainingMs) || remainingMs < 1000) throw new Error("timeout_budget_exhausted");
    const attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, Math.floor(remainingMs)));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);
    let httpStatus = 0;
    let raw: unknown = undefined;

    try {
      const p: any = { ...payload };
      if (omitReasoningEffort) delete p.reasoning_effort;
      if (omitResponseFormat) delete p.response_format;
      if (omitIncludeReasoning) delete p.include_reasoning;

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

      if (extraUserLine) {
        p.messages = p.messages.slice();
        p.messages.push({ role: "user", content: extraUserLine });
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(p),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      httpStatus = res.status;
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
    const isTransientHttp =
      msg.startsWith("HTTP 408") ||
      msg.startsWith("HTTP 425") ||
      msg.startsWith("HTTP 429") ||
      msg.startsWith("HTTP 500") ||
      msg.startsWith("HTTP 502") ||
      msg.startsWith("HTTP 503") ||
      msg.startsWith("HTTP 504");
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

      const gotLengthCutoff = msg.includes("finish_reason=length") || msg.includes("native_finish_reason=max_output_tokens");
      const likelyThinkingWithoutFinal =
        gotLengthCutoff && msg.includes("reasoning_content") && msg.includes("content\":null");

      const wantsMoreTokens =
        gotLengthCutoff ||
        msg.includes("max_output_tokens");
      // If a thinking model burned the whole budget on reasoning and never produced a tool call / JSON,
      // prefer trying a SHORT output budget with a very strong "JSON-first" hint instead of simply
      // raising max_tokens (which can increase latency and timeouts).
      const bumpedMaxTokens = wantsMoreTokens
        ? likelyThinkingWithoutFinal
          ? Math.min(600, Math.max(200, maxTokens))
          : Math.min(8000, Math.max(1200, maxTokens * 4))
        : undefined;

      // Forced tool calling seems to encourage some "thinking" models to produce long reasoning and never reach the tool call.
      // On retry, prefer allowing either a tool call or direct JSON content.
      const toolsModeOverride: ToolsMode | undefined = wantsToolsOff
        ? "off"
        : likelyThinkingWithoutFinal || isTimeouty
          ? "auto"
          : undefined;

      const useToolsOverride = wantsToolsOff ? false : undefined;
      const retry = await callOnce(
        `Your previous output was invalid/empty or not parseable. Do NOT explain. Start your response with '{' and return ONLY a single valid JSON object matching the schema exactly. api_version must be "${request.api_version}".`,
        bumpedMaxTokens,
        toolsModeOverride,
        useToolsOverride,
        rejectsReasoningEffort ? true : undefined,
        rejectsResponseFormat ? true : undefined,
        rejectsIncludeReasoning ? true : undefined,
      );
      return { ...retry, resolvedModel, provider: keysName, baseUrl };
    } catch (e2) {
      const msg2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`openai_compat failed: ${msg2}`);
    }
  }
}
