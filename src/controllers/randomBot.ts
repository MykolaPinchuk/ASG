import { PRNG } from "../game/prng.js";
import { otherPlayer, type Action, type LocationId, type Observation, type PlayerId, type ScenarioDefinition } from "../game/types.js";
import type { Controller, ControllerOutput } from "./controller.js";

export class RandomBot implements Controller {
  readonly id = "random";
  private readonly rng: PRNG;
  private readonly adjacency: Record<LocationId, LocationId[]>;
  private readonly reinforceCostPerStrength: number;

  constructor(params: { seed: number; adjacency: Record<LocationId, LocationId[]>; scenario: ScenarioDefinition }) {
    this.rng = new PRNG(params.seed);
    this.adjacency = params.adjacency;
    this.reinforceCostPerStrength = params.scenario.settings.reinforceCostPerStrength;
  }

  decide(observation: Observation): ControllerOutput {
    const player = observation.player;

    const maxReinforce = Math.min(3, Math.floor(observation.supplies[player] / this.reinforceCostPerStrength));
    if (maxReinforce > 0 && this.rng.bool()) {
      const amount = this.rng.intInclusive(1, maxReinforce);
      return { actions: [{ type: "reinforce", amount }], rationaleText: `Random: reinforce ${amount}` };
    }

    const movable: LocationId[] = [];
    for (const node of Object.values(observation.nodes)) {
      if (node.forces[player] > 0) movable.push(node.id);
    }
    if (movable.length === 0) return { actions: [{ type: "pass" }], rationaleText: "Random: no moves" };

    const from = movable[this.rng.intInclusive(0, movable.length - 1)]!;
    const fromNode = observation.nodes[from];
    const neighbors = this.adjacency[from] ?? [];
    if (neighbors.length === 0) return { actions: [{ type: "pass" }], rationaleText: `Random: ${from} has no neighbors` };

    const to = neighbors[this.rng.intInclusive(0, neighbors.length - 1)]!;
    const available = fromNode.forces[player];
    const amount = this.rng.intInclusive(1, available);

    const enemy: PlayerId = otherPlayer(player);
    const rationale = `Random: move ${amount} ${from}→${to} (enemy at to: ${observation.nodes[to].forces[enemy]})`;
    const actions: Action[] = [{ type: "move", from, to, amount }];
    return { actions, rationaleText: rationale };
  }
}

