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

export interface TurnRecord {
  ply: number;
  player: PlayerId;
  observations: Record<PlayerId, Observation>;
  actions: Action[];
  rationaleText?: string;
  events: Event[];
  stateAfter: GameState;
}

export interface Replay {
  version: string;
  createdAt: string;
  seed: number;
  scenario: ScenarioDefinition;
  turns: TurnRecord[];
  result: GameResult;
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}
