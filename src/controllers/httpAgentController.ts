import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Controller, ControllerOutput, MemoryContext, ControllerTurnContext } from "./controller.js";
import type { Action, Observation, PlayerId } from "../game/types.js";

type AgentRequest = {
  api_version: string;
  match_id: string;
  player: PlayerId;
  scenario_id: string;
  ply: number;
  action_budget: number;
  observation: object;
  memory_context?: MemoryContext;
};

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
    config?: {
      reasoningEffort?: "low" | "medium" | "high";
      rationaleStyle?: "concise" | "structured10";
      promptMode?: "compact" | "full";
      timeoutMs?: number;
      maxTokens?: number;
      temperature?: number;
      useTools?: boolean;
      toolsMode?: "auto" | "force" | "off";
      stream?: "auto" | "on" | "off";
      thinkHint?: "on" | "off";
      retryOnFailure?: boolean;
      retryReasoningEffort?: "low" | "medium" | "high";
    };
  };
  server_diagnostics?: {
    provider?: string;
    upstreamStatus?: number;
    upstreamError?: string;
    tokenUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    };
    usedFallback?: boolean;
    usedRetry?: boolean;
    retry?: {
      fromReasoningEffort?: "low" | "medium" | "high";
      toReasoningEffort?: "low" | "medium" | "high";
      firstError?: string;
      firstUpstreamStatus?: number;
    };
    attempts?: Array<{
      attempt?: number;
      reasoningEffort?: "low" | "medium" | "high";
      latencyMs?: number;
      upstreamStatus?: number;
      error?: string;
      tokenUsage?: {
        promptTokens?: number;
        completionTokens?: number;
        reasoningTokens?: number;
        totalTokens?: number;
      };
    }>;
  };
};

function ensureActUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.pathname.endsWith("/act")) return u.toString();
    u.pathname = u.pathname.replace(/\/+$/, "") + "/act";
    return u.toString();
  } catch {
    // Best-effort fallback for non-URL strings.
    const trimmed = url.replace(/\/+$/, "");
    if (trimmed.endsWith("/act")) return trimmed;
    return `${trimmed}/act`;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTokenUsage(value: unknown):
  | {
      promptTokens?: number;
      completionTokens?: number;
      reasoningTokens?: number;
      totalTokens?: number;
    }
  | undefined {
  if (!isObject(value)) return undefined;
  const promptTokens =
    typeof (value as any).promptTokens === "number" && Number.isFinite((value as any).promptTokens)
      ? Math.max(0, Math.floor((value as any).promptTokens))
      : undefined;
  const completionTokens =
    typeof (value as any).completionTokens === "number" && Number.isFinite((value as any).completionTokens)
      ? Math.max(0, Math.floor((value as any).completionTokens))
      : undefined;
  const reasoningTokens =
    typeof (value as any).reasoningTokens === "number" && Number.isFinite((value as any).reasoningTokens)
      ? Math.max(0, Math.floor((value as any).reasoningTokens))
      : undefined;
  const totalTokens =
    typeof (value as any).totalTokens === "number" && Number.isFinite((value as any).totalTokens)
      ? Math.max(0, Math.floor((value as any).totalTokens))
      : undefined;
  if (promptTokens === undefined && completionTokens === undefined && reasoningTokens === undefined && totalTokens === undefined) {
    return undefined;
  }
  return { promptTokens, completionTokens, reasoningTokens, totalTokens };
}

function isAction(value: unknown): value is Action {
  if (!isObject(value)) return false;
  const type = value.type;
  if (type === "pass") return Object.keys(value).length === 1;
  if (type === "reinforce") return Number.isInteger(value.amount) && (value.amount as number) >= 1;
  if (type === "move") {
    return (
      typeof value.from === "string" &&
      value.from.length > 0 &&
      typeof value.to === "string" &&
      value.to.length > 0 &&
      Number.isInteger(value.amount) &&
      (value.amount as number) >= 1
    );
  }
  return false;
}

function parseAgentResponse(json: unknown, expectedApiVersion: string): AgentResponse {
  if (!isObject(json)) throw new Error("response must be an object");
  if (typeof json.api_version !== "string" || json.api_version.length === 0) throw new Error("response.api_version required");
  if (json.api_version !== expectedApiVersion) {
    throw new Error(`api_version mismatch: got ${json.api_version}, expected ${expectedApiVersion}`);
  }
  if (!Array.isArray(json.actions)) throw new Error("response.actions must be an array");
  const actions = json.actions;
  for (const a of actions) {
    if (!isAction(a)) throw new Error("response.actions contains invalid action shape");
  }
  const rationale_text = typeof json.rationale_text === "string" ? json.rationale_text : undefined;
  const infoRaw = (json as any).agent_info;
  let agent_info: AgentResponse["agent_info"] | undefined;
  if (isObject(infoRaw) && (typeof infoRaw.provider === "string" || typeof infoRaw.model === "string")) {
    const mm = (infoRaw as any).modelMode;
    const modelMode = mm === "auto" || mm === "explicit" ? mm : undefined;
    const cfgRaw = (infoRaw as any).config;
    let config: NonNullable<AgentResponse["agent_info"]>["config"] | undefined;
    if (isObject(cfgRaw)) {
      const reasoningEffortRaw = (cfgRaw as any).reasoningEffort;
      const promptModeRaw = (cfgRaw as any).promptMode;
      const rationaleStyleRaw = (cfgRaw as any).rationaleStyle;
      const toolsModeRaw = (cfgRaw as any).toolsMode;
      const streamRaw = (cfgRaw as any).stream;
      const thinkHintRaw = (cfgRaw as any).thinkHint;
      const retryReasoningEffortRaw = (cfgRaw as any).retryReasoningEffort;

      const reasoningEffort =
        reasoningEffortRaw === "low" || reasoningEffortRaw === "medium" || reasoningEffortRaw === "high"
          ? reasoningEffortRaw
          : undefined;
      const promptMode = promptModeRaw === "compact" || promptModeRaw === "full" ? promptModeRaw : undefined;
      const rationaleStyle = rationaleStyleRaw === "concise" || rationaleStyleRaw === "structured10" ? rationaleStyleRaw : undefined;
      const toolsMode = toolsModeRaw === "auto" || toolsModeRaw === "force" || toolsModeRaw === "off" ? toolsModeRaw : undefined;
      const stream = streamRaw === "auto" || streamRaw === "on" || streamRaw === "off" ? streamRaw : undefined;
      const thinkHint = thinkHintRaw === "on" || thinkHintRaw === "off" ? thinkHintRaw : undefined;
      const retryReasoningEffort =
        retryReasoningEffortRaw === "low" || retryReasoningEffortRaw === "medium" || retryReasoningEffortRaw === "high"
          ? retryReasoningEffortRaw
          : undefined;
      const timeoutMs =
        typeof (cfgRaw as any).timeoutMs === "number" && Number.isFinite((cfgRaw as any).timeoutMs)
          ? Math.floor((cfgRaw as any).timeoutMs)
          : undefined;
      const maxTokens =
        typeof (cfgRaw as any).maxTokens === "number" && Number.isFinite((cfgRaw as any).maxTokens)
          ? Math.floor((cfgRaw as any).maxTokens)
          : undefined;
      const temperature =
        typeof (cfgRaw as any).temperature === "number" && Number.isFinite((cfgRaw as any).temperature)
          ? Number((cfgRaw as any).temperature)
          : undefined;
      const useTools = typeof (cfgRaw as any).useTools === "boolean" ? (cfgRaw as any).useTools : undefined;
      const retryOnFailure = typeof (cfgRaw as any).retryOnFailure === "boolean" ? (cfgRaw as any).retryOnFailure : undefined;

      if (
        reasoningEffort !== undefined ||
        rationaleStyle !== undefined ||
        promptMode !== undefined ||
        timeoutMs !== undefined ||
        maxTokens !== undefined ||
        temperature !== undefined ||
        useTools !== undefined ||
        toolsMode !== undefined ||
        stream !== undefined ||
        thinkHint !== undefined ||
        retryOnFailure !== undefined ||
        retryReasoningEffort !== undefined
      ) {
        config = {
          reasoningEffort,
          rationaleStyle,
          promptMode,
          timeoutMs,
          maxTokens,
          temperature,
          useTools,
          toolsMode,
          stream,
          thinkHint,
          retryOnFailure,
          retryReasoningEffort,
        };
      }
    }
    agent_info = {
      provider: typeof infoRaw.provider === "string" ? infoRaw.provider : undefined,
      baseUrl: typeof infoRaw.baseUrl === "string" ? infoRaw.baseUrl : undefined,
      model: typeof infoRaw.model === "string" ? infoRaw.model : undefined,
      modelMode,
      config,
    };
  }

  const diagRaw = (json as any).server_diagnostics;
  let server_diagnostics: AgentResponse["server_diagnostics"] | undefined;
  if (isObject(diagRaw)) {
    const upstreamStatus =
      typeof (diagRaw as any).upstreamStatus === "number" && Number.isFinite((diagRaw as any).upstreamStatus)
        ? Math.floor((diagRaw as any).upstreamStatus)
        : undefined;
    const upstreamError = typeof (diagRaw as any).upstreamError === "string" ? (diagRaw as any).upstreamError : undefined;
    const usedFallback = typeof (diagRaw as any).usedFallback === "boolean" ? (diagRaw as any).usedFallback : undefined;
    const usedRetry = typeof (diagRaw as any).usedRetry === "boolean" ? (diagRaw as any).usedRetry : undefined;
    const provider = typeof (diagRaw as any).provider === "string" ? (diagRaw as any).provider : undefined;
    const tokenUsage = parseTokenUsage((diagRaw as any).tokenUsage);

    const retryRaw = (diagRaw as any).retry;
    let retry: NonNullable<AgentResponse["server_diagnostics"]>["retry"] | undefined;
    if (isObject(retryRaw)) {
      const from =
        (retryRaw as any).fromReasoningEffort === "low" ||
        (retryRaw as any).fromReasoningEffort === "medium" ||
        (retryRaw as any).fromReasoningEffort === "high"
          ? ((retryRaw as any).fromReasoningEffort as "low" | "medium" | "high")
          : undefined;
      const to =
        (retryRaw as any).toReasoningEffort === "low" ||
        (retryRaw as any).toReasoningEffort === "medium" ||
        (retryRaw as any).toReasoningEffort === "high"
          ? ((retryRaw as any).toReasoningEffort as "low" | "medium" | "high")
          : undefined;
      const firstError = typeof (retryRaw as any).firstError === "string" ? (retryRaw as any).firstError : undefined;
      const firstUpstreamStatus =
        typeof (retryRaw as any).firstUpstreamStatus === "number" && Number.isFinite((retryRaw as any).firstUpstreamStatus)
          ? Math.floor((retryRaw as any).firstUpstreamStatus)
          : undefined;
      if (from || to || firstError || firstUpstreamStatus !== undefined) {
        retry = { fromReasoningEffort: from, toReasoningEffort: to, firstError, firstUpstreamStatus };
      }
    }

    const attemptsRaw = (diagRaw as any).attempts;
    let attempts: NonNullable<AgentResponse["server_diagnostics"]>["attempts"] | undefined;
    if (Array.isArray(attemptsRaw)) {
      const parsedAttempts: NonNullable<NonNullable<AgentResponse["server_diagnostics"]>["attempts"]> = [];
      for (const a of attemptsRaw) {
        if (!isObject(a)) continue;
        const attempt =
          typeof (a as any).attempt === "number" && Number.isFinite((a as any).attempt) ? Math.floor((a as any).attempt) : undefined;
        const reasoningEffort =
          (a as any).reasoningEffort === "low" || (a as any).reasoningEffort === "medium" || (a as any).reasoningEffort === "high"
            ? ((a as any).reasoningEffort as "low" | "medium" | "high")
            : undefined;
        const latencyMs =
          typeof (a as any).latencyMs === "number" && Number.isFinite((a as any).latencyMs) ? Math.max(0, Math.floor((a as any).latencyMs)) : undefined;
        const upstreamStatus =
          typeof (a as any).upstreamStatus === "number" && Number.isFinite((a as any).upstreamStatus)
            ? Math.floor((a as any).upstreamStatus)
            : undefined;
        const error = typeof (a as any).error === "string" ? (a as any).error : undefined;
        const tokenUsage = parseTokenUsage((a as any).tokenUsage);
        if (attempt !== undefined || reasoningEffort || latencyMs !== undefined || upstreamStatus !== undefined || error || tokenUsage) {
          parsedAttempts.push({ attempt, reasoningEffort, latencyMs, upstreamStatus, error, tokenUsage });
        }
      }
      if (parsedAttempts.length) attempts = parsedAttempts;
    }

    if (provider || upstreamStatus !== undefined || upstreamError || tokenUsage || usedFallback !== undefined || usedRetry !== undefined || retry || attempts) {
      server_diagnostics = { provider, upstreamStatus, upstreamError, tokenUsage, usedFallback, usedRetry, retry, attempts };
    }
  }

  const memory_update = typeof json.memory_update === "string" ? json.memory_update : undefined;
  return { api_version: json.api_version, actions: actions as Action[], rationale_text, memory_update, agent_info, server_diagnostics };
}

export type HttpAgentControllerParams = {
  id?: string;
  url: string;
  apiVersion: string;
  matchId: string;
  scenarioId: string;
  player: PlayerId;
  actionBudget: number;
  timeoutMs: number;
  maxResponseBytes: number;
  logDir?: string;
};

export class HttpAgentController implements Controller {
  readonly id: string;
  private readonly url: string;
  private readonly apiVersion: string;
  private readonly matchId: string;
  private readonly scenarioId: string;
  private readonly player: PlayerId;
  private readonly actionBudget: number;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly logDir?: string;
  private _agentInfo?: AgentResponse["agent_info"];
  private readonly decisionTelemetry: Array<{
    ply: number;
    latencyMs: number;
    httpStatus?: number;
    error?: string;
  }> = [];

  constructor(params: HttpAgentControllerParams) {
    this.id = params.id ?? "agent";
    this.url = ensureActUrl(params.url);
    this.apiVersion = params.apiVersion;
    this.matchId = params.matchId;
    this.scenarioId = params.scenarioId;
    this.player = params.player;
    this.actionBudget = params.actionBudget;
    this.timeoutMs = params.timeoutMs;
    this.maxResponseBytes = params.maxResponseBytes;
    this.logDir = params.logDir;
  }

  get agentInfo(): AgentResponse["agent_info"] | undefined {
    return this._agentInfo;
  }

  get telemetry(): ReadonlyArray<{ ply: number; latencyMs: number; httpStatus?: number; error?: string }> {
    return this.decisionTelemetry;
  }

  async decide(observation: Observation, context?: ControllerTurnContext): Promise<ControllerOutput> {
    const request: AgentRequest = {
      api_version: this.apiVersion,
      match_id: this.matchId,
      player: this.player,
      scenario_id: this.scenarioId,
      ply: observation.ply,
      action_budget: this.actionBudget,
      observation: observation as unknown as object,
      ...(context?.memoryContext ? { memory_context: context.memoryContext } : {}),
    };

    const startedAt = Date.now();
    let responseText: string | undefined;
    let parsedResponse: AgentResponse | undefined;
    let error: string | undefined;
    let httpStatus: number | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      httpStatus = res.status;
      responseText = await res.text();
      if (responseText.length > this.maxResponseBytes) throw new Error(`response too large: ${responseText.length} bytes`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      parsedResponse = parseAgentResponse(JSON.parse(responseText), this.apiVersion);
      if (parsedResponse.agent_info) this._agentInfo = parsedResponse.agent_info;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - startedAt;
    this.decisionTelemetry.push({ ply: observation.ply, latencyMs, httpStatus, error });

    if (this.logDir) {
      const dir = path.resolve(this.logDir, this.matchId);
      const file = path.join(dir, `ply_${String(observation.ply).padStart(4, "0")}_${this.player}.json`);
      await mkdir(dir, { recursive: true });
      await writeFile(
        file,
        JSON.stringify(
          {
            request,
            response: parsedResponse ?? (responseText ? { raw: responseText } : undefined),
            httpStatus,
            latencyMs,
            error,
          },
          null,
          2,
        ),
        "utf8",
      );
    }

    if (!parsedResponse) {
      const why = error ? `agent error: ${error}` : "agent error";
      return {
        actions: [{ type: "pass" }],
        rationaleText: why + ` (latency ${latencyMs}ms)`,
        latencyMs,
        diagnostics: { httpStatus, error },
      };
    }

    return {
      actions: parsedResponse.actions,
      rationaleText: parsedResponse.rationale_text,
      memoryUpdate: parsedResponse.memory_update,
      latencyMs,
      diagnostics: {
        httpStatus,
        error,
        upstreamStatus: parsedResponse.server_diagnostics?.upstreamStatus,
        upstreamError: parsedResponse.server_diagnostics?.upstreamError,
        tokenUsage: parsedResponse.server_diagnostics?.tokenUsage,
        usedFallback: parsedResponse.server_diagnostics?.usedFallback,
        usedRetry: parsedResponse.server_diagnostics?.usedRetry,
        retry: parsedResponse.server_diagnostics?.retry,
        attempts: parsedResponse.server_diagnostics?.attempts,
      },
    };
  }
}
