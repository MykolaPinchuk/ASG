import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

type PlayerId = "P1" | "P2";

type AgentRequest = {
  api_version: string;
  match_id: string;
  player: PlayerId;
  scenario_id: string;
  ply: number;
  action_budget: number;
  observation: any;
};

type Scenario = {
  id: string;
  settings: { reinforceCostPerStrength: number };
  map: { nodes: { id: string }[]; edges: [string, string][] };
};

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

function buildAdjacency(nodes: string[], edges: [string, string][]): Record<string, string[]> {
  const adj: Record<string, Set<string>> = {};
  for (const n of nodes) adj[n] = new Set();
  for (const [a, b] of edges) {
    if (!adj[a] || !adj[b]) continue;
    adj[a].add(b);
    adj[b].add(a);
  }
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(adj)) out[k] = Array.from(v).sort();
  return out;
}

async function loadScenarioById(scenarioDir: string, scenarioId: string): Promise<Scenario | null> {
  const candidate = path.join(scenarioDir, `${scenarioId}.json`);
  try {
    const text = await readFile(candidate, "utf8");
    return JSON.parse(text) as Scenario;
  } catch {
    return null;
  }
}

function chooseAction(req: AgentRequest, scenario: Scenario, adjacency: Record<string, string[]>) {
  const player = req.player;
  const obs = req.observation ?? {};
  const nodes: Record<string, any> = obs.nodes ?? {};
  const supplies: Record<PlayerId, number> = obs.supplies ?? { P1: 0, P2: 0 };

  // Try reinforce if affordable (best-effort; cost comes from scenario settings).
  const cost = scenario.settings?.reinforceCostPerStrength ?? 1;
  if (Number.isFinite(supplies[player]) && supplies[player] >= cost) {
    return { actions: [{ type: "reinforce", amount: 1 }], rationale_text: "stub: reinforce 1" };
  }

  // Otherwise, try a small move from any node that has forces.
  for (const [nodeId, node] of Object.entries(nodes)) {
    const f = node?.forces?.[player];
    if (!Number.isFinite(f) || f <= 0) continue;
    const neigh = adjacency[nodeId]?.[0];
    if (!neigh) continue;
    return { actions: [{ type: "move", from: nodeId, to: neigh, amount: 1 }], rationale_text: `stub: move 1 ${nodeId}→${neigh}` };
  }

  return { actions: [{ type: "pass" }], rationale_text: "stub: pass" };
}

async function main() {
  const args = parseArgs(process.argv);
  const port = Number.parseInt(args.get("--port") ?? "8787", 10);
  const scenarioDir = args.get("--scenario-dir") ?? process.env.ASG_SCENARIO_DIR ?? path.resolve("scenarios");
  const expectedApiVersion = args.get("--api-version") ?? "0.1";

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/act") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }

    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      const parsed = JSON.parse(text) as AgentRequest;

      if (parsed.api_version !== expectedApiVersion) {
        res.statusCode = 400;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ api_version: expectedApiVersion, actions: [{ type: "pass" }], rationale_text: "stub: api_version mismatch" }));
        return;
      }

      const scenario = await loadScenarioById(scenarioDir, parsed.scenario_id);
      if (!scenario) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ api_version: expectedApiVersion, actions: [{ type: "pass" }], rationale_text: "stub: unknown scenario" }));
        return;
      }

      const nodes = scenario.map.nodes.map((n) => n.id);
      const adjacency = buildAdjacency(nodes, scenario.map.edges);
      const response = chooseAction(parsed, scenario, adjacency);

      // Always respect action_budget on the server side too.
      const actions = Array.isArray(response.actions) ? response.actions.slice(0, parsed.action_budget ?? 0) : [];

      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ api_version: expectedApiVersion, actions, rationale_text: response.rationale_text }));
    } catch (e) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ api_version: expectedApiVersion, actions: [{ type: "pass" }], rationale_text: "stub: error parsing request" }));
    }
  });

  server.listen(port, () => {
    console.log(`ASG stub agent listening on http://127.0.0.1:${port}/act`);
    console.log(`Scenario dir: ${scenarioDir}`);
    console.log(`API version: ${expectedApiVersion}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

