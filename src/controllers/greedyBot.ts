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
    const budget = Math.max(0, this.scenario.settings.actionBudget);

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
    const maxReinforce = Math.min(6, Math.floor(observation.supplies[player] / reinforceCostPerStrength));
    if (budget > 0 && maxReinforce > 0) {
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

        const amount = movable;
        candidates.push({ from: node.id, to: neigh, amount, toDist: neighDist });
      }
    }

    const toYield = (id: LocationId) => observation.nodes[id]?.supplyYield ?? 0;
    const toIsTarget = (id: LocationId) => id === target;
    const toEnemyStrength = (id: LocationId) => observation.nodes[id]?.forces?.[enemy] ?? 0;

    candidates.sort((a, b) => {
      const aKey = Number(toIsTarget(a.to)) * 1000 + Math.min(10, toYield(a.to)) * 10 - toEnemyStrength(a.to);
      const bKey = Number(toIsTarget(b.to)) * 1000 + Math.min(10, toYield(b.to)) * 10 - toEnemyStrength(b.to);
      return (
        bKey - aKey ||
        a.toDist - b.toDist ||
        b.amount - a.amount ||
        a.from.localeCompare(b.from) ||
        a.to.localeCompare(b.to)
      );
    });

    const usedFrom = new Set<LocationId>();
    for (const cand of candidates) {
      if (actions.length >= budget) break;
      if (usedFrom.has(cand.from)) continue;

      const enemyAtTo = toEnemyStrength(cand.to);
      const isAttack = enemyAtTo > 0;
      const isHqAttack = cand.to === this.scenario.players[enemy].hq;

      if (isAttack && !isHqAttack) {
        const friendlyAtTo = observation.nodes[cand.to]?.forces?.[player] ?? 0;
        const attackerStrength = friendlyAtTo + cand.amount;
        const defenderStrength = enemyAtTo;
        const deltaBase = attackerStrength - defenderStrength;

        // Avoid obviously losing attacks; allow equal-strength attacks to break stalemates.
        // Prefer attacking on/near the objective (resources / target).
        const isObjective = toYield(cand.to) > 0 || toIsTarget(cand.to);
        const ok = deltaBase >= 0 || (isObjective && deltaBase >= -1);
        if (!ok) continue;
      }

      actions.push({ type: "move", from: cand.from, to: cand.to, amount: cand.amount });
      usedFrom.add(cand.from);
      rationaleParts.push(
        `move ${cand.amount} ${cand.from}→${cand.to}${isAttack ? ` (attack ${enemyAtTo})` : ""}`,
      );
    }

    if (actions.length === 0 && budget > 0) {
      actions.push({ type: "pass" });
      rationaleParts.push("pass");
    }

    return { actions, rationaleText: `Greedy: ${rationaleParts.join("; ")}` };
  }
}
