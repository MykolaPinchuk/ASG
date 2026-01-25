import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Controller, ControllerOutput } from "./controller.js";
import type { Action, Observation, PlayerId } from "../game/types.js";

type AgentRequest = {
  api_version: string;
  match_id: string;
  player: PlayerId;
  scenario_id: string;
  ply: number;
  action_budget: number;
  observation: object;
};

type AgentResponse = {
  api_version: string;
  actions: Action[];
  rationale_text?: string;
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
  return { api_version: json.api_version, actions: actions as Action[], rationale_text };
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

  async decide(observation: Observation): Promise<ControllerOutput> {
    const request: AgentRequest = {
      api_version: this.apiVersion,
      match_id: this.matchId,
      player: this.player,
      scenario_id: this.scenarioId,
      ply: observation.ply,
      action_budget: this.actionBudget,
      observation: observation as unknown as object,
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
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const latencyMs = Date.now() - startedAt;

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
      return { actions: [{ type: "pass" }], rationaleText: why + ` (latency ${latencyMs}ms)` };
    }

    return {
      actions: parsedResponse.actions,
      rationaleText: parsedResponse.rationale_text,
    };
  }
}

