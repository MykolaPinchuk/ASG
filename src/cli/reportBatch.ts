import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAdjacency } from "../game/scenario.js";
import { runMatch } from "../game/match.js";
import { GreedyBot } from "../controllers/greedyBot.js";
import { RandomBot } from "../controllers/randomBot.js";
import { loadScenarioFromFile } from "../scenario/loadScenario.js";
import type { Controller } from "../controllers/controller.js";
import type { Replay } from "../game/types.js";

type ControllerName = "greedy" | "random";
type OutputFormat = "text" | "json" | "md";

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

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[sorted.length - 1]!;
  const b = sorted[base + 1] ?? a;
  return a + (b - a) * rest;
}

type PerMatch = {
  seed: number;
  plies: number;
  result: "DRAW" | "WIN_P1" | "WIN_P2";
  events: {
    income: number;
    reinforce: number;
    move: number;
    combat: number;
    capture: number;
    invalid: number;
  };
  combats: {
    avgAttackerWinProb: number | null;
    avgWinnerStrengthAfter: number | null;
  };
  resources: {
    p1PliesOwned: number;
    p2PliesOwned: number;
    neutralPliesOwned: number;
    totalPliesObserved: number;
  };
};

function analyzeReplay(replay: Replay): Omit<PerMatch, "seed"> {
  const plies = replay.turns.length;
  const result: PerMatch["result"] =
    replay.result.type === "draw" ? "DRAW" : replay.result.winner === "P1" ? "WIN_P1" : "WIN_P2";

  const events = { income: 0, reinforce: 0, move: 0, combat: 0, capture: 0, invalid: 0 };
  let sumWinProb = 0;
  let sumWinnerStrength = 0;

  const resourceNodes = replay.scenario.map.nodes.filter((n) => n.supplyYield > 0).map((n) => n.id);
  let p1PliesOwned = 0;
  let p2PliesOwned = 0;
  let neutralPliesOwned = 0;

  for (const turn of replay.turns) {
    for (const e of turn.events) {
      if (e.type === "income") events.income += 1;
      else if (e.type === "reinforce") events.reinforce += 1;
      else if (e.type === "move") events.move += 1;
      else if (e.type === "combat") {
        events.combat += 1;
        sumWinProb += e.attackerWinProb;
        sumWinnerStrength += e.winnerStrengthAfter;
      } else if (e.type === "capture") events.capture += 1;
      else if (e.type === "invalid_action") events.invalid += 1;
    }

    for (const nodeId of resourceNodes) {
      const owner = turn.stateAfter.nodes[nodeId]?.owner;
      if (owner === "P1") p1PliesOwned += 1;
      else if (owner === "P2") p2PliesOwned += 1;
      else neutralPliesOwned += 1;
    }
  }

  const combatCount = events.combat;

  return {
    plies,
    result,
    events,
    combats: {
      avgAttackerWinProb: combatCount > 0 ? sumWinProb / combatCount : null,
      avgWinnerStrengthAfter: combatCount > 0 ? sumWinnerStrength / combatCount : null,
    },
    resources: {
      p1PliesOwned,
      p2PliesOwned,
      neutralPliesOwned,
      totalPliesObserved: replay.turns.length * resourceNodes.length,
    },
  };
}

function formatText(summary: ReturnType<typeof aggregate>, perMatch: PerMatch[], scenarioId: string): string {
  const lines: string[] = [];
  lines.push(`Scenario: ${scenarioId}`);
  lines.push(`Matchup: P1=${summary.matchup.p1} vs P2=${summary.matchup.p2}`);
  lines.push(`Seeds: start=${summary.seeds.start} count=${summary.seeds.count}`);
  lines.push(
    `Results: P1 wins=${summary.results.p1Wins} P2 wins=${summary.results.p2Wins} draws=${summary.results.draws} (draw rate ${(summary.results.draws / summary.seeds.count * 100).toFixed(1)}%)`,
  );
  lines.push(
    `Plies: mean=${summary.plies.mean.toFixed(2)} median=${summary.plies.median.toFixed(1)} p10=${summary.plies.p10.toFixed(1)} p90=${summary.plies.p90.toFixed(1)} min=${summary.plies.min} max=${summary.plies.max}`,
  );
  lines.push(
    `Events/match: move=${summary.eventsPerMatch.move.toFixed(2)} combat=${summary.eventsPerMatch.combat.toFixed(2)} capture=${summary.eventsPerMatch.capture.toFixed(2)} reinforce=${summary.eventsPerMatch.reinforce.toFixed(2)} invalid=${summary.eventsPerMatch.invalid.toFixed(2)}`,
  );
  if (summary.combats.avgAttackerWinProb !== null) {
    lines.push(
      `Combat avg: attackerWinProb=${summary.combats.avgAttackerWinProb.toFixed(3)} winnerStrengthAfter=${summary.combats.avgWinnerStrengthAfter?.toFixed(2)}`,
    );
  }
  if (summary.resources.totalPliesObserved > 0) {
    lines.push(
      `Resource ownership (plies*resources): P1=${summary.resources.p1Frac.toFixed(1)}% P2=${summary.resources.p2Frac.toFixed(1)}% Neutral=${summary.resources.neutralFrac.toFixed(1)}%`,
    );
  }
  if (perMatch.length > 0) {
    const draws = perMatch.filter((m) => m.result === "DRAW");
    if (draws.length > 0) lines.push(`Draw seeds: ${draws.map((d) => d.seed).join(", ")}`);
  }
  return lines.join("\n");
}

function formatMarkdown(summary: ReturnType<typeof aggregate>, perMatch: PerMatch[], scenarioId: string): string {
  const drawRate = (summary.results.draws / summary.seeds.count) * 100;
  const lines: string[] = [];
  lines.push(`# ASG batch report`);
  lines.push(``);
  lines.push(`- Scenario: \`${scenarioId}\``);
  lines.push(`- Matchup: \`P1=${summary.matchup.p1}\` vs \`P2=${summary.matchup.p2}\``);
  lines.push(`- Seeds: start=${summary.seeds.start}, count=${summary.seeds.count}`);
  lines.push(``);
  lines.push(`## Results`);
  lines.push(`- P1 wins: ${summary.results.p1Wins}`);
  lines.push(`- P2 wins: ${summary.results.p2Wins}`);
  lines.push(`- Draws: ${summary.results.draws} (${drawRate.toFixed(1)}%)`);
  lines.push(``);
  lines.push(`## Plies`);
  lines.push(
    `- mean=${summary.plies.mean.toFixed(2)}, median=${summary.plies.median.toFixed(1)}, p10=${summary.plies.p10.toFixed(
      1,
    )}, p90=${summary.plies.p90.toFixed(1)}, min=${summary.plies.min}, max=${summary.plies.max}`,
  );
  lines.push(``);
  lines.push(`## Events (per match)`);
  lines.push(`- move=${summary.eventsPerMatch.move.toFixed(2)}`);
  lines.push(`- combat=${summary.eventsPerMatch.combat.toFixed(2)}`);
  lines.push(`- capture=${summary.eventsPerMatch.capture.toFixed(2)}`);
  lines.push(`- reinforce=${summary.eventsPerMatch.reinforce.toFixed(2)}`);
  lines.push(`- invalid=${summary.eventsPerMatch.invalid.toFixed(2)}`);
  lines.push(``);
  lines.push(`## Combat (averages across combats)`);
  lines.push(
    `- attackerWinProb=${summary.combats.avgAttackerWinProb === null ? "n/a" : summary.combats.avgAttackerWinProb.toFixed(3)}`,
  );
  lines.push(
    `- winnerStrengthAfter=${
      summary.combats.avgWinnerStrengthAfter === null ? "n/a" : summary.combats.avgWinnerStrengthAfter.toFixed(2)
    }`,
  );
  lines.push(``);
  lines.push(`## Resource ownership (plies * resourceNodes)`);
  lines.push(
    `- P1=${summary.resources.p1Frac.toFixed(1)}%, P2=${summary.resources.p2Frac.toFixed(1)}%, Neutral=${summary.resources.neutralFrac.toFixed(1)}%`,
  );
  lines.push(``);
  lines.push(`## Notes`);
  if (drawRate > 20) {
    lines.push(`- Draw rate is high; consider tuning: baseIncome/supplyYield, reinforce cost, or add/adjust map connectivity.`);
  } else {
    lines.push(`- Draw rate looks acceptable for MVP tuning iterations.`);
  }
  const invalidTotal = perMatch.reduce((acc, m) => acc + m.events.invalid, 0);
  if (invalidTotal > 0) lines.push(`- Invalid actions observed: ${invalidTotal} (should be 0 for scripted bots).`);
  const drawSeeds = perMatch.filter((m) => m.result === "DRAW").map((m) => m.seed);
  if (drawSeeds.length > 0) lines.push(`- Draw seeds: ${drawSeeds.join(", ")}`);
  return lines.join("\n");
}

function aggregate(perMatch: PerMatch[]) {
  const n = perMatch.length;
  const pliesArr = perMatch.map((m) => m.plies).slice().sort((a, b) => a - b);
  const mean = pliesArr.reduce((a, b) => a + b, 0) / Math.max(1, n);

  const results = { p1Wins: 0, p2Wins: 0, draws: 0 };
  const eventsTotal = { income: 0, reinforce: 0, move: 0, combat: 0, capture: 0, invalid: 0 };
  let combats = 0;
  let sumWinProb = 0;
  let sumWinnerStrength = 0;
  let p1Res = 0;
  let p2Res = 0;
  let neutralRes = 0;
  let totalRes = 0;

  for (const m of perMatch) {
    if (m.result === "DRAW") results.draws += 1;
    else if (m.result === "WIN_P1") results.p1Wins += 1;
    else results.p2Wins += 1;

    for (const [k, v] of Object.entries(m.events)) (eventsTotal as any)[k] += v;
    if (m.combats.avgAttackerWinProb !== null) {
      // Convert per-match averages back to sums by multiplying by combat count for the match.
      const c = m.events.combat;
      combats += c;
      sumWinProb += (m.combats.avgAttackerWinProb ?? 0) * c;
      sumWinnerStrength += (m.combats.avgWinnerStrengthAfter ?? 0) * c;
    }

    p1Res += m.resources.p1PliesOwned;
    p2Res += m.resources.p2PliesOwned;
    neutralRes += m.resources.neutralPliesOwned;
    totalRes += m.resources.totalPliesObserved;
  }

  return {
    seeds: { start: perMatch[0]?.seed ?? 0, count: n },
    matchup: { p1: "?", p2: "?" } as { p1: string; p2: string },
    results,
    plies: {
      mean,
      median: quantile(pliesArr, 0.5),
      p10: quantile(pliesArr, 0.1),
      p90: quantile(pliesArr, 0.9),
      min: pliesArr[0] ?? 0,
      max: pliesArr[pliesArr.length - 1] ?? 0,
    },
    eventsPerMatch: {
      income: eventsTotal.income / Math.max(1, n),
      reinforce: eventsTotal.reinforce / Math.max(1, n),
      move: eventsTotal.move / Math.max(1, n),
      combat: eventsTotal.combat / Math.max(1, n),
      capture: eventsTotal.capture / Math.max(1, n),
      invalid: eventsTotal.invalid / Math.max(1, n),
    },
    combats: {
      avgAttackerWinProb: combats > 0 ? sumWinProb / combats : null,
      avgWinnerStrengthAfter: combats > 0 ? sumWinnerStrength / combats : null,
    },
    resources: {
      p1Frac: totalRes > 0 ? (p1Res / totalRes) * 100 : 0,
      p2Frac: totalRes > 0 ? (p2Res / totalRes) * 100 : 0,
      neutralFrac: totalRes > 0 ? (neutralRes / totalRes) * 100 : 0,
      totalPliesObserved: totalRes,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const scenarioPath = path.resolve(args.get("--scenario") ?? "scenarios/scenario_01.json");
  const p1 = (args.get("--p1") ?? "greedy") as ControllerName;
  const p2 = (args.get("--p2") ?? "greedy") as ControllerName;
  const start = Number.parseInt(args.get("--start") ?? "1", 10);
  const count = Number.parseInt(args.get("--count") ?? "50", 10);
  const perSeed = args.get("--per-seed") === "true";
  const format = (args.get("--format") ?? "text") as OutputFormat;
  const outPath = args.get("--out");

  if (!Number.isInteger(start) || start < 0) throw new Error("--start must be an integer >= 0");
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error("--count must be an integer in [1, 500]");
  if (!["text", "json", "md"].includes(format)) throw new Error("--format must be one of: text, json, md");

  const scenario = await loadScenarioFromFile(scenarioPath);
  const adjacency = createAdjacency(scenario);
  const ctx = { scenario, adjacency };

  const perMatch: PerMatch[] = [];

  for (let i = 0; i < count; i++) {
    const seed = start + i;
    const controllers: Record<"P1" | "P2", Controller> = {
      P1: controllerFromName({ name: p1, seed: seed + 101, adjacency, scenario }),
      P2: controllerFromName({ name: p2, seed: seed + 202, adjacency, scenario }),
    };
    const replay = await runMatch({ ctx, controllers, seed });
    const analyzed = analyzeReplay(replay);
    const row: PerMatch = { seed, ...analyzed };
    perMatch.push(row);

    if (perSeed) {
      console.log(`seed=${seed} plies=${row.plies} result=${row.result} combats=${row.events.combat} captures=${row.events.capture}`);
    }
  }

  const summary = aggregate(perMatch);
  summary.seeds.start = start;
  summary.matchup.p1 = p1;
  summary.matchup.p2 = p2;

  let output: string;
  if (format === "json") output = JSON.stringify({ summary, perMatch }, null, 2);
  else if (format === "md") output = formatMarkdown(summary, perMatch, scenario.id);
  else output = formatText(summary, perMatch, scenario.id);

  if (outPath) {
    const dir = path.dirname(outPath);
    await mkdir(dir, { recursive: true });
    await writeFile(outPath, output + "\n", "utf8");
    console.log(`Wrote: ${outPath}`);
  } else {
    console.log(output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

