import type { Action, DecisionDiagnostics, Observation, TurnSummary } from "../game/types.js";

export interface FullTurnMemory {
  turn: number;
  me: {
    actions: Action[];
    summary: TurnSummary;
  };
  enemy: {
    actions: Action[];
    summary: TurnSummary;
  };
}

export interface MemoryContext {
  persistentNote?: string;
  lastFullTurn?: FullTurnMemory;
}

export interface ControllerTurnContext {
  memoryContext?: MemoryContext;
}

export interface ControllerOutput {
  actions: Action[];
  rationaleText?: string;
  memoryUpdate?: string;
  latencyMs?: number;
  diagnostics?: DecisionDiagnostics;
}

export interface Controller {
  id: string;
  decide(observation: Observation, context?: ControllerTurnContext): Promise<ControllerOutput> | ControllerOutput;
}
