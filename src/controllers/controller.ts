import type { Action, Observation } from "../game/types.js";

export interface ControllerOutput {
  actions: Action[];
  rationaleText?: string;
}

export interface Controller {
  id: string;
  decide(observation: Observation): Promise<ControllerOutput> | ControllerOutput;
}

