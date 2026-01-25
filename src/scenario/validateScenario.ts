import { invariant } from "../lib/invariant.js";
import type { PlayerId, Scenario } from "./types.js";

const PLAYER_IDS: readonly PlayerId[] = ["P1", "P2"] as const;

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function validateScenarioReferentialIntegrity(scenario: Scenario): void {
  invariant(scenario.id.length > 0, "scenario.id must be non-empty");
  invariant(scenario.name.length > 0, "scenario.name must be non-empty");

  const nodeIds = new Set(scenario.map.nodes.map((n) => n.id));
  invariant(nodeIds.size === scenario.map.nodes.length, "node ids must be unique");

  for (const playerId of PLAYER_IDS) {
    const hqId = scenario.players[playerId]?.hq;
    invariant(typeof hqId === "string" && hqId.length > 0, `${playerId}.hq must be set`);
    invariant(nodeIds.has(hqId), `${playerId}.hq (${hqId}) must exist in map.nodes`);
  }

  for (const [a, b] of scenario.map.edges) {
    invariant(nodeIds.has(a), `edge endpoint missing from nodes: ${a}`);
    invariant(nodeIds.has(b), `edge endpoint missing from nodes: ${b}`);
    invariant(a !== b, `edge must not be a self-loop: ${a}`);
  }

  for (const playerId of PLAYER_IDS) {
    invariant(
      isNonNegativeInteger(scenario.initialState.playerSupply[playerId]),
      `initialState.playerSupply.${playerId} must be a non-negative integer`,
    );
  }

  for (const [nodeId, forces] of Object.entries(scenario.initialState.nodeForces)) {
    invariant(nodeIds.has(nodeId), `initialState.nodeForces key not in map.nodes: ${nodeId}`);
    for (const playerId of PLAYER_IDS) {
      invariant(
        isNonNegativeInteger(forces[playerId]),
        `initialState.nodeForces.${nodeId}.${playerId} must be a non-negative integer`,
      );
    }
  }

  for (const node of scenario.map.nodes) {
    invariant(Number.isFinite(node.x), `node ${node.id} x must be finite`);
    invariant(Number.isFinite(node.y), `node ${node.id} y must be finite`);
    invariant(
      isNonNegativeInteger(node.supplyYield),
      `node ${node.id} supplyYield must be a non-negative integer`,
    );
  }
}

