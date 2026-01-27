import { PRNG } from "../game/prng.js";
import type { Observation, ScenarioDefinition } from "../game/types.js";
import type { LocationId } from "../game/types.js";
import type { Controller, ControllerOutput } from "./controller.js";
import { GreedyBot } from "./greedyBot.js";
import { RandomBot } from "./randomBot.js";

export class MixBot implements Controller {
  readonly id = "mix";
  private readonly rng: PRNG;
  private readonly greedy: GreedyBot;
  private readonly random: RandomBot;
  private readonly greedyProb: number;

  constructor(params: {
    seed: number;
    adjacency: Record<LocationId, LocationId[]>;
    scenario: ScenarioDefinition;
    greedyProb: number;
  }) {
    this.rng = new PRNG(params.seed);
    this.greedy = new GreedyBot({ adjacency: params.adjacency, scenario: params.scenario });
    this.random = new RandomBot({
      seed: params.seed ^ 0x9e3779b9,
      adjacency: params.adjacency,
      scenario: params.scenario,
    });
    const p = Number(params.greedyProb);
    this.greedyProb = Number.isFinite(p) ? Math.max(0, Math.min(1, p)) : 0.5;
  }

  decide(observation: Observation): ControllerOutput {
    if (this.greedyProb <= 0) return this.random.decide(observation);
    if (this.greedyProb >= 1) return this.greedy.decide(observation);
    const u = this.rng.nextFloat01();
    return u < this.greedyProb ? this.greedy.decide(observation) : this.random.decide(observation);
  }
}

