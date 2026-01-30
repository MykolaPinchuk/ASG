import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdjacency } from "../game/scenario.js";
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
  if (params.name === "random")
    return new RandomBot({ seed: params.seed, adjacency: params.adjacency, scenario: params.scenario });
  return new GreedyBot({ adjacency: params.adjacency, scenario: params.scenario });
}

function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const args = parseArgs(process.argv);
  const scenarioPath = path.resolve(args.get("--scenario") ?? "scenarios/scenario_01.json");
  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "greedy") as ControllerName;
  const start = Number.parseInt(args.get("--start") ?? "1", 10);
  const count = Number.parseInt(args.get("--count") ?? "5", 10);
  const turnCapPlies = Number.parseInt(args.get("--turn-cap-plies") ?? "30", 10);
  const unsafeAllowLong = (args.get("--unsafe-allow-long") ?? "false").toLowerCase() === "true";
  const unsafeAllowMany = (args.get("--unsafe-allow-many") ?? "false").toLowerCase() === "true";
  const outDir = args.get("--out-dir") ?? path.join("replays", "batch", nowStamp());

  if (!Number.isInteger(start) || start < 0) throw new Error("--start must be an integer >= 0");
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("--count must be an integer in [1, 500]");
  if (!Number.isInteger(turnCapPlies) || turnCapPlies < 1) throw new Error("--turn-cap-plies must be an integer >= 1");
  if (turnCapPlies > 30 && !unsafeAllowLong) {
    throw new Error("Policy: --turn-cap-plies must be <= 30 on v0/v0.x (pass --unsafe-allow-long true to override).");
  }
  if (count > 5 && !unsafeAllowMany) {
    throw new Error("Policy: --count must be <= 5 on v0/v0.x (pass --unsafe-allow-many true to override).");
  }

  const scenario = await loadScenarioFromFile(scenarioPath);
  scenario.settings.turnCapPlies = turnCapPlies;
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  const stats = {
    seeds: { start, count },
    matchup: { p1, p2 },
    results: { p1Wins: 0, p2Wins: 0, draws: 0 },
    avgPlies: 0,
  };

  let totalPlies = 0;

  for (let i = 0; i < count; i++) {
    const seed = start + i;

    const controllers: Record<"P1" | "P2", Controller> = {
      P1: controllerFromName({ name: p1, seed: seed + 101, adjacency, scenario }),
      P2: controllerFromName({ name: p2, seed: seed + 202, adjacency, scenario }),
    };

    const replay = await runMatch({ ctx, controllers, seed });
    totalPlies += replay.turns.length;

    if (replay.result.type === "draw") stats.results.draws += 1;
    else if (replay.result.winner === "P1") stats.results.p1Wins += 1;
    else stats.results.p2Wins += 1;

    const outFile = path.join(outDir, `${replay.scenario.id}_seed${seed}_${p1}_vs_${p2}.json`);
    await mkdir(path.dirname(outFile), { recursive: true });
    await writeFile(outFile, JSON.stringify(replay, null, 2), "utf8");

    console.log(
      `seed=${seed} plies=${replay.turns.length} result=${
        replay.result.type === "draw" ? "DRAW" : `WIN_${replay.result.winner}`
      } replay=${outFile}`,
    );
  }

  stats.avgPlies = totalPlies / count;

  console.log("---");
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
