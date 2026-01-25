export type PlayerId = "P1" | "P2";
export type Owner = PlayerId | "Neutral";
export type NodeId = string;

export type ScenarioSettings = {
  turnCapPlies: number;
  actionBudget: number;
  baseIncome: number;
  reinforceCostPerStrength: number;
  combatVarianceFraction: number;
};

export type ScenarioMapNode = {
  id: NodeId;
  x: number;
  y: number;
  owner: Owner;
  supplyYield: number;
};

export type Scenario = {
  id: string;
  name: string;
  startingPlayer: PlayerId;
  players: Record<PlayerId, { hq: NodeId }>;
  settings: ScenarioSettings;
  map: {
    nodes: ScenarioMapNode[];
    edges: [NodeId, NodeId][];
  };
  initialState: {
    playerSupply: Record<PlayerId, number>;
    nodeForces: Record<NodeId, Record<PlayerId, number>>;
  };
};

