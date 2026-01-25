import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInitialState } from "../game/engine.js";
import { loadScenarioFromFile } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { RandomBot } from "../controllers/randomBot.js";
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

function controllerFromName(name: ControllerName, seed: number, adjacency: Record<string, string[]>): Controller {
  if (name === "random") return new RandomBot(seed, adjacency);
  return new GreedyBot({ adjacency });
}

async function main() {
  const args = parseArgs(process.argv);

  const defaultScenarioPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scenarios/scenario_01.json");
  const scenarioPath = args.get("--scenario") ?? defaultScenarioPath;

  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "greedy") as ControllerName;
  const seed = Number.parseInt(args.get("--seed") ?? "1", 10);

  const loaded = await loadScenarioFromFile(scenarioPath);
  const ctx = { scenario: loaded.scenario, adjacency: loaded.adjacency };

  // Ensure the scenario loads and initial state builds before running controllers.
  createInitialState(ctx);

  const controllers: Record<"P1" | "P2", Controller> = {
    P1: controllerFromName(p1, seed + 101, loaded.adjacency),
    P2: controllerFromName(p2, seed + 202, loaded.adjacency),
  };

  const replay = await runMatch({ ctx, controllers, seed });

  const outArg = args.get("--out");
  const outDir = outArg ? path.dirname(outArg) : path.resolve("replays");
  const outFile = outArg ?? path.join(outDir, `${replay.scenario.id}_seed${seed}_${p1}_vs_${p2}.json`);

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, JSON.stringify(replay, null, 2), "utf8");

  // eslint-disable-next-line no-console
  console.log(`Wrote replay: ${outFile}`);
  // eslint-disable-next-line no-console
  console.log(`Result: ${replay.result.type === "win" ? `WIN ${replay.result.winner}` : "DRAW"}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
