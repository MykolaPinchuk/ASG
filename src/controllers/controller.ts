import type { Action, DecisionDiagnostics, Observation } from "../game/types.js";

export interface ControllerOutput {
  actions: Action[];
  rationaleText?: string;
  latencyMs?: number;
  diagnostics?: DecisionDiagnostics;
}

export interface Controller {
  id: string;
  decide(observation: Observation): Promise<ControllerOutput> | ControllerOutput;
}
