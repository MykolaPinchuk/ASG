import { invariant } from "../lib/invariant.js";
import type { LocationId, ScenarioDefinition, ScenarioEdge } from "./types.js";

export type Adjacency = Record<LocationId, LocationId[]>;

function buildAdjacency(nodes: Set<LocationId>, edges: ScenarioEdge[]): Adjacency {
  const adjacency: Record<LocationId, Set<LocationId>> = {};
  for (const nodeId of nodes) adjacency[nodeId] = new Set<LocationId>();

  for (const [a, b] of edges) {
    invariant(nodes.has(a), `Edge references unknown node: ${a}`);
    invariant(nodes.has(b), `Edge references unknown node: ${b}`);
    invariant(a !== b, `Self-edge not allowed: ${a}`);
    adjacency[a].add(b);
    adjacency[b].add(a);
  }

  const out: Adjacency = {};
  for (const nodeId of nodes) out[nodeId] = Array.from(adjacency[nodeId]).sort();
  return out;
}

export function createAdjacency(scenario: ScenarioDefinition): Adjacency {
  const nodeIds = new Set<LocationId>();
  for (const node of scenario.map.nodes) nodeIds.add(node.id);
  return buildAdjacency(nodeIds, scenario.map.edges);
}

