import assert from "node:assert/strict";
import path from "node:path";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { RandomBot } from "../controllers/randomBot.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import type { Controller } from "../controllers/controller.js";
import type { Replay } from "../game/types.js";

type ControllerName = "greedy" | "random";

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (!key?.startsWith("--")) continue;
    const val = argv[i + 1];
    if (!val || val.startsWith("--")) {
      args.set(key, "true");
    } else {
      args.set(key, val);
      i += 1;
    }
  }
  return args;
}

function controllerFromName(params: {
  name: ControllerName;
  seed: number;
  adjacency: Record<string, string[]>;
  scenario: Parameters<typeof createAdjacency>[0];
}): Controller {
  if (params.name === "random") return new RandomBot({ seed: params.seed, adjacency: params.adjacency, scenario: params.scenario });
  return new GreedyBot({ adjacency: params.adjacency, scenario: params.scenario });
}

function normalizeReplay(replay: Replay): Replay {
  const cloned = JSON.parse(JSON.stringify(replay)) as Replay;
  cloned.createdAt = "1970-01-01T00:00:00.000Z";
  return cloned;
}

async function main() {
  const args = parseArgs(process.argv);
  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "random") as ControllerName;
  const seed = Number.parseInt(args.get("--seed") ?? "1", 10);

  const scenario = await loadScenarioFromFile(path.resolve(scenarioPath));
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  const controllersA: Record<"P1" | "P2", Controller> = {
    P1: controllerFromName({ name: p1, seed: seed + 101, adjacency, scenario }),
    P2: controllerFromName({ name: p2, seed: seed + 202, adjacency, scenario }),
  };

  const controllersB: Record<"P1" | "P2", Controller> = {
    P1: controllerFromName({ name: p1, seed: seed + 101, adjacency, scenario }),
    P2: controllerFromName({ name: p2, seed: seed + 202, adjacency, scenario }),
  };

  const [r1, r2] = await Promise.all([runMatch({ ctx, controllers: controllersA, seed }), runMatch({ ctx, controllers: controllersB, seed })]);

  const s1 = JSON.stringify(normalizeReplay(r1));
  const s2 = JSON.stringify(normalizeReplay(r2));

  assert.equal(s1, s2, "Determinism check failed: normalized replays differ");
  console.log(`OK: deterministic for seed=${seed} (${p1} vs ${p2})`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

