import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdjacency } from "../game/scenario.js";
import { createInitialState } from "../game/engine.js";
import { runMatch } from "../game/match.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { RandomBot } from "../controllers/randomBot.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import type { Controller } from "../controllers/controller.js";

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

async function main() {
  const args = parseArgs(process.argv);

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "greedy") as ControllerName;
  const seed = Number.parseInt(args.get("--seed") ?? "1", 10);

  const scenario = await loadScenarioFromFile(scenarioPath);
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  createInitialState(ctx);

  const controllers: Record<"P1" | "P2", Controller> = {
    P1: controllerFromName({ name: p1, seed: seed + 101, adjacency, scenario }),
    P2: controllerFromName({ name: p2, seed: seed + 202, adjacency, scenario }),
  };

  const replay = await runMatch({ ctx, controllers, seed });

  const outArg = args.get("--out");
  const outDir = outArg ? path.dirname(outArg) : path.resolve("replays");
  const outFile = outArg ?? path.join(outDir, `${replay.scenario.id}_seed${seed}_${p1}_vs_${p2}.json`);

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(replay, null, 2), "utf8");

  console.log(`Wrote replay: ${outFile}`);
  console.log(`Result: ${replay.result.type === "win" ? `WIN ${replay.result.winner}` : "DRAW"}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

