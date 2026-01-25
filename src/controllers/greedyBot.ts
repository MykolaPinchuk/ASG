import { otherPlayer, type Action, type LocationId, type Observation, type ScenarioDefinition } from "../game/types.js";
import type { Controller, ControllerOutput } from "./controller.js";

function shortestDistances(adjacency: Record<LocationId, LocationId[]>, target: LocationId): Record<LocationId, number> {
  const dist: Record<LocationId, number> = {};
  const queue: LocationId[] = [target];
  dist[target] = 0;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const nextDist = dist[cur]! + 1;
    for (const n of adjacency[cur] ?? []) {
      if (dist[n] === undefined) {
        dist[n] = nextDist;
        queue.push(n);
      }
    }
  }
  return dist;
}

export class GreedyBot implements Controller {
  readonly id = "greedy";
  private readonly adjacency: Record<LocationId, LocationId[]>;
  private readonly scenario: ScenarioDefinition;

  constructor(params: { adjacency: Record<LocationId, LocationId[]>; scenario: ScenarioDefinition }) {
    this.adjacency = params.adjacency;
    this.scenario = params.scenario;
  }

  decide(observation: Observation): ControllerOutput {
    const player = observation.player;
    const enemy = otherPlayer(player);

    const resourceNodes = Object.values(observation.nodes).filter((n) => n.supplyYield > 0);
    const notOwnedResources = resourceNodes.filter((n) => n.owner !== player);

    const target: LocationId =
      notOwnedResources.length > 0
        ? notOwnedResources
            .slice()
            .sort((a, b) => (b.supplyYield - a.supplyYield) || a.id.localeCompare(b.id))[0]!.id
        : this.scenario.players[enemy].hq;

    const dist = shortestDistances(this.adjacency, target);

    const actions: Action[] = [];
    const rationaleParts: string[] = [];

    const reinforceCostPerStrength = this.scenario.settings.reinforceCostPerStrength;
    const maxReinforce = Math.min(3, Math.floor(observation.supplies[player] / reinforceCostPerStrength));
    if (maxReinforce > 0) {
      actions.push({ type: "reinforce", amount: maxReinforce });
      rationaleParts.push(`reinforce ${maxReinforce}`);
    }

    type MoveCandidate = { from: LocationId; to: LocationId; amount: number; toDist: number };
    const candidates: MoveCandidate[] = [];

    for (const node of Object.values(observation.nodes)) {
      const available = node.forces[player];
      if (available <= 0) continue;

      const fromDist = dist[node.id];
      for (const neigh of this.adjacency[node.id] ?? []) {
        const neighDist = dist[neigh];
        if (neighDist === undefined) continue;
        if (fromDist !== undefined && neighDist >= fromDist) continue;

        const keep = node.id === this.scenario.players[player].hq ? 1 : 0;
        const movable = Math.max(0, available - keep);
        if (movable <= 0) continue;

        const amount = Math.max(1, Math.floor(movable / 2));
        candidates.push({ from: node.id, to: neigh, amount, toDist: neighDist });
      }
    }

    candidates.sort((a, b) => a.toDist - b.toDist || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
    const best = candidates[0];
    if (best) {
      actions.push({ type: "move", from: best.from, to: best.to, amount: best.amount });
      rationaleParts.push(`move ${best.amount} ${best.from}→${best.to} toward ${target}`);
    } else {
      actions.push({ type: "pass" });
      rationaleParts.push("pass");
    }

    return { actions, rationaleText: `Greedy: ${rationaleParts.join("; ")}` };
  }
}

