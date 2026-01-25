export type PlayerId = "P1" | "P2";
export type Owner = PlayerId | "Neutral";
export type LocationId = string;

export interface GameSettings {
  turnCapPlies: number;
  actionBudget: number;
  baseIncome: number;
  reinforceCostPerStrength: number;
  combatVarianceFraction: number;
}

export interface ScenarioPlayerDefinition {
  hq: LocationId;
}

export interface ScenarioNodeDefinition {
  id: LocationId;
  x: number;
  y: number;
  owner: Owner;
  supplyYield: number;
}

export type ScenarioEdge = [LocationId, LocationId];

export interface ScenarioMapDefinition {
  nodes: ScenarioNodeDefinition[];
  edges: ScenarioEdge[];
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  startingPlayer: PlayerId;
  players: Record<PlayerId, ScenarioPlayerDefinition>;
  settings: GameSettings;
  map: ScenarioMapDefinition;
  initialState: {
    playerSupply: Record<PlayerId, number>;
    nodeForces: Record<LocationId, Record<PlayerId, number>>;
  };
}

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

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
