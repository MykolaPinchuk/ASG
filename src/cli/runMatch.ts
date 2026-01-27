import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdjacency } from "../game/scenario.js";
import { createInitialState } from "../game/engine.js";
import { runMatch } from "../game/match.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { RandomBot } from "../controllers/randomBot.js";
import { MixBot } from "../controllers/mixBot.js";
import { HttpAgentController } from "../controllers/httpAgentController.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import type { Controller } from "../controllers/controller.js";

type ControllerName = "greedy" | "random" | "mix" | "agent";

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
  agent?: {
    url: string;
    timeoutMs: number;
    apiVersion: string;
    matchId: string;
    logDir?: string;
  };
  mix?: {
    greedyProb: number;
  };
  player: "P1" | "P2";
}): Controller {
  if (params.name === "random") return new RandomBot({ seed: params.seed, adjacency: params.adjacency, scenario: params.scenario });
  if (params.name === "mix") {
    return new MixBot({
      seed: params.seed,
      adjacency: params.adjacency,
      scenario: params.scenario,
      greedyProb: params.mix?.greedyProb ?? 0.5,
    });
  }
  if (params.name === "agent") {
    if (!params.agent?.url) throw new Error("Controller=agent requires --agent-url");
    return new HttpAgentController({
      url: params.agent.url,
      apiVersion: params.agent.apiVersion,
      matchId: params.agent.matchId,
      scenarioId: params.scenario.id,
      player: params.player,
      actionBudget: params.scenario.settings.actionBudget,
      timeoutMs: params.agent.timeoutMs,
      maxResponseBytes: 256_000,
      logDir: params.agent.logDir,
    });
  }
  return new GreedyBot({ adjacency: params.adjacency, scenario: params.scenario });
}

async function main() {
  const args = parseArgs(process.argv);

  const scenarioPath = args.get("--scenario") ?? "scenarios/scenario_01.json";
  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "greedy") as ControllerName;
  const seed = Number.parseInt(args.get("--seed") ?? "1", 10);
  const mixGreedyProb = Number.parseFloat(args.get("--mix-greedy-prob") ?? "0.5");
  const agentUrl = args.get("--agent-url");
  // Default must accommodate real LLM latency (even via a local agent server).
  const agentTimeoutMs = Number.parseInt(args.get("--agent-timeout-ms") ?? "60000", 10);
  const agentApiVersion = args.get("--agent-api-version") ?? "0.1";
  const agentLogDir = args.get("--agent-log-dir") ?? undefined;
  const turnCapOverrideRaw = args.get("--turn-cap-plies");
  const turnCapPliesOverride = turnCapOverrideRaw ? Number.parseInt(turnCapOverrideRaw, 10) : undefined;

  if (!Number.isFinite(mixGreedyProb) || mixGreedyProb < 0 || mixGreedyProb > 1) throw new Error("--mix-greedy-prob must be in [0,1]");

  const scenario = await loadScenarioFromFile(scenarioPath);
  if (turnCapPliesOverride !== undefined) {
    if (!Number.isInteger(turnCapPliesOverride) || turnCapPliesOverride < 1) throw new Error("--turn-cap-plies must be an integer >= 1");
    scenario.settings.turnCapPlies = turnCapPliesOverride;
  }
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  createInitialState(ctx);

  const matchId = args.get("--match-id") ?? `${scenario.id}_seed${seed}`;

  const controllers: Record<"P1" | "P2", Controller> = {
    P1: controllerFromName({
      name: p1,
      seed: seed + 101,
      adjacency,
      scenario,
      agent: agentUrl ? { url: agentUrl, timeoutMs: agentTimeoutMs, apiVersion: agentApiVersion, matchId, logDir: agentLogDir } : undefined,
      mix: { greedyProb: mixGreedyProb },
      player: "P1",
    }),
    P2: controllerFromName({
      name: p2,
      seed: seed + 202,
      adjacency,
      scenario,
      agent: agentUrl ? { url: agentUrl, timeoutMs: agentTimeoutMs, apiVersion: agentApiVersion, matchId, logDir: agentLogDir } : undefined,
      mix: { greedyProb: mixGreedyProb },
      player: "P2",
    }),
  };

  const replay = await runMatch({ ctx, controllers, seed });
  replay.players = {
    P1:
      p1 === "agent"
        ? {
            kind: "agent",
            agentUrl: agentUrl ?? undefined,
            ...(controllers.P1 instanceof HttpAgentController ? (controllers.P1.agentInfo ?? {}) : {}),
          }
        : p1 === "mix"
          ? { kind: "mix", greedyProb: mixGreedyProb }
          : { kind: p1 },
    P2:
      p2 === "agent"
        ? {
            kind: "agent",
            agentUrl: agentUrl ?? undefined,
            ...(controllers.P2 instanceof HttpAgentController ? (controllers.P2.agentInfo ?? {}) : {}),
          }
        : p2 === "mix"
          ? { kind: "mix", greedyProb: mixGreedyProb }
          : { kind: p2 },
  };

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
