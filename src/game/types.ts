export type { NodeId, Owner, PlayerId } from "../scenario/types.js";
import type { NodeId, Owner, PlayerId, Scenario, ScenarioMapNode, ScenarioSettings } from "../scenario/types.js";

export type LocationId = NodeId;
export type GameSettings = ScenarioSettings;
export type ScenarioDefinition = Scenario;
export type ScenarioNodeDefinition = ScenarioMapNode;
export type ScenarioEdge = [LocationId, LocationId];

export interface NodeState {
  id: LocationId;
  x: number;
  y: number;
  owner: Owner;
  supplyYield: number;
  forces: Record<PlayerId, number>;
}

export interface GameState {
  scenarioId: string;
  ply: number;
  activePlayer: PlayerId;
  supplies: Record<PlayerId, number>;
  nodes: Record<LocationId, NodeState>;
}

export type Action =
  | { type: "reinforce"; amount: number }
  | { type: "move"; from: LocationId; to: LocationId; amount: number }
  | { type: "pass" };

export type Event =
  | { type: "income"; player: PlayerId; amount: number; supplyAfter: number }
  | { type: "invalid_action"; player: PlayerId; action: Action; message: string }
  | {
      type: "reinforce";
      player: PlayerId;
      location: LocationId;
      amount: number;
      supplyAfter: number;
      strengthAfter: number;
    }
  | {
      type: "move";
      player: PlayerId;
      from: LocationId;
      to: LocationId;
      amount: number;
      fromStrengthAfter: number;
      toStrengthAfter: number;
    }
  | {
      type: "combat";
      location: LocationId;
      attacker: PlayerId;
      defender: PlayerId;
      attackerStrengthBefore: number;
      defenderStrengthBefore: number;
      attackerWinProb: number;
      varianceBound: number;
      noise: number;
      delta: number;
      winner: PlayerId;
      winnerStrengthAfter: number;
    }
  | { type: "capture"; location: LocationId; newOwner: Owner }
  | { type: "game_end"; result: GameResult };

export type GameResult =
  | { type: "win"; winner: PlayerId; reason: "hq_captured" }
  | { type: "draw"; reason: "turn_cap" };

export interface Observation {
  player: PlayerId;
  ply: number;
  activePlayer: PlayerId;
  supplies: Record<PlayerId, number>;
  nodes: Record<LocationId, Omit<NodeState, "forces"> & { forces: Record<PlayerId, number> }>;
}

export interface DecisionDiagnostics {
  /**
   * HTTP status from the controller endpoint (if applicable).
   */
  httpStatus?: number;
  /**
   * Any controller-level error (timeout, parse error, etc.).
   */
  error?: string;
  /**
   * Optional upstream/provider status (best-effort).
   */
  upstreamStatus?: number;
  /**
   * Optional upstream/provider error string (best-effort, sanitized).
   */
  upstreamError?: string;
  /**
   * Whether the controller (or agent server) used a configured fallback.
   */
  usedFallback?: boolean;
}

export interface TurnRecord {
  ply: number;
  player: PlayerId;
  observations: Record<PlayerId, Observation>;
  actions: Action[];
  rationaleText?: string;
  latencyMs: number;
  controllerId?: string;
  diagnostics?: DecisionDiagnostics;
  events: Event[];
  stateAfter: GameState;
}

export interface Replay {
  version: string;
  createdAt: string;
  seed: number;
  scenario: ScenarioDefinition;
  players?: Record<
    PlayerId,
    | { kind: "greedy" }
    | { kind: "random" }
    | { kind: "mix"; greedyProb: number }
    | {
        kind: "agent";
        agentUrl?: string;
        provider?: string;
        baseUrl?: string;
        model?: string;
        modelMode?: "auto" | "explicit";
        config?: {
          reasoningEffort?: "low" | "medium" | "high";
          promptMode?: "compact" | "full";
          timeoutMs?: number;
          maxTokens?: number;
          temperature?: number;
          useTools?: boolean;
          toolsMode?: "auto" | "force" | "off";
          stream?: "auto" | "on" | "off";
          thinkHint?: "on" | "off";
        };
      }
  >;
  turns: TurnRecord[];
  result: GameResult;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}
