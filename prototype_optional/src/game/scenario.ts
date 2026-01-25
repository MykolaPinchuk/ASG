import { readFile } from "node:fs/promises";
import {
  invariant,
  type LocationId,
  type PlayerId,
  type ScenarioDefinition,
  type ScenarioEdge,
} from "./types.js";

export interface LoadedScenario {
  scenario: ScenarioDefinition;
  adjacency: Record<LocationId, LocationId[]>;
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === "P1" || value === "P2";
}

function buildAdjacency(nodes: Set<LocationId>, edges: ScenarioEdge[]): Record<LocationId, LocationId[]> {
  const adjacency: Record<LocationId, Set<LocationId>> = {};
  for (const nodeId of nodes) adjacency[nodeId] = new Set<LocationId>();

  for (const [a, b] of edges) {
    invariant(nodes.has(a), `Edge references unknown node: ${a}`);
    invariant(nodes.has(b), `Edge references unknown node: ${b}`);
    invariant(a !== b, `Self-edge not allowed: ${a}`);
    adjacency[a].add(b);
    adjacency[b].add(a);
  }

  const out: Record<LocationId, LocationId[]> = {};
  for (const nodeId of nodes) out[nodeId] = Array.from(adjacency[nodeId]).sort();
  return out;
}

export async function loadScenarioFromFile(path: string): Promise<LoadedScenario> {
  const raw = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  invariant(typeof parsed === "object" && parsed !== null, "Scenario JSON must be an object");

  const scenario = parsed as ScenarioDefinition;
  invariant(typeof scenario.id === "string" && scenario.id.length > 0, "Scenario.id must be a string");
  invariant(typeof scenario.name === "string" && scenario.name.length > 0, "Scenario.name must be a string");
  invariant(isPlayerId(scenario.startingPlayer), "Scenario.startingPlayer must be P1 or P2");

  const nodes = scenario.map?.nodes;
  const edges = scenario.map?.edges;
  invariant(Array.isArray(nodes) && nodes.length > 0, "Scenario.map.nodes must be a non-empty array");
  invariant(Array.isArray(edges), "Scenario.map.edges must be an array");

  const nodeIds = new Set<LocationId>();
  for (const node of nodes) {
    invariant(node && typeof node === "object", "Node must be an object");
    invariant(typeof node.id === "string" && node.id.length > 0, "Node.id must be a string");
    invariant(!nodeIds.has(node.id), `Duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
  }

  for (const player of ["P1", "P2"] as const) {
    const def = scenario.players?.[player];
    invariant(def && typeof def.hq === "string", `Scenario.players.${player}.hq must be a string`);
    invariant(nodeIds.has(def.hq), `HQ for ${player} references unknown node: ${def.hq}`);
  }

  const adjacency = buildAdjacency(nodeIds, edges as ScenarioEdge[]);
  return { scenario, adjacency };
}

