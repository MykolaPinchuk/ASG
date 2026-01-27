import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

type PlayerId = "P1" | "P2";

type LoggedAgentRequest = {
  match_id: string;
  player: PlayerId;
  scenario_id: string;
  ply: number;
  action_budget: number;
};

type LoggedAgentResponse =
  | {
      api_version: string;
      actions: Array<{ type: string; [k: string]: unknown }>;
      rationale_text?: string;
      agent_info?: { provider?: string; baseUrl?: string; model?: string; modelMode?: "auto" | "explicit" };
    }
  | { raw: string };

type LoggedIo = {
  request: LoggedAgentRequest;
  response?: LoggedAgentResponse;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function coerceLoggedIo(json: unknown): LoggedIo | null {
  if (!isObject(json)) return null;
  const req = (json as any).request;
  if (!isObject(req)) return null;
  if (typeof req.match_id !== "string") return null;
  if (req.player !== "P1" && req.player !== "P2") return null;
  if (typeof req.ply !== "number" || !Number.isInteger(req.ply)) return null;
  const ab = req.action_budget;
  const actionBudget = typeof ab === "number" && Number.isInteger(ab) ? ab : 0;
  const out: LoggedIo = {
    request: {
      match_id: req.match_id,
      player: req.player,
      scenario_id: typeof req.scenario_id === "string" ? req.scenario_id : "unknown",
      ply: req.ply,
      action_budget: actionBudget,
    },
    response: (json as any).response,
    httpStatus: Number.isInteger((json as any).httpStatus) ? (json as any).httpStatus : undefined,
    latencyMs: Number.isInteger((json as any).latencyMs) ? (json as any).latencyMs : undefined,
    error: typeof (json as any).error === "string" ? (json as any).error : undefined,
  };
  return out;
}

function passOnlyActions(actions: Array<{ type: string }>): boolean {
  if (actions.length === 0) return true;
  return actions.every((a) => a?.type === "pass");
}

function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const clamped = Math.min(1, Math.max(0, p));
  const idx = Math.floor(clamped * (sortedAsc.length - 1));
  return sortedAsc[idx] ?? null;
}

type MatchSummary = {
  matchId: string;
  player?: PlayerId;
  provider?: string;
  model?: string;
  totalPlies: number;
  ok: number;
  passOnly: number;
  httpErrors: number;
  parseErrors: number;
  timeouts: number;
  otherErrors: number;
  latencyMs: { avg: number | null; p50: number | null; p95: number | null; max: number | null };
};

function summarizeMatch(matchId: string, entries: LoggedIo[]): MatchSummary {
  let player: PlayerId | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let totalPlies = 0;
  let ok = 0;
  let passOnly = 0;
  let httpErrors = 0;
  let parseErrors = 0;
  let timeouts = 0;
  let otherErrors = 0;
  const latencies: number[] = [];

  for (const e of entries) {
    totalPlies += 1;
    player = player ?? e.request.player;

    if (typeof e.latencyMs === "number" && Number.isFinite(e.latencyMs)) latencies.push(e.latencyMs);

    const hasError = typeof e.error === "string" && e.error.length > 0;
    const httpStatus = e.httpStatus;
    if (hasError && e.error?.toLowerCase().includes("aborted")) timeouts += 1;
    else if (hasError) otherErrors += 1;
    if (httpStatus !== undefined && httpStatus !== 200) httpErrors += 1;

    const resp = e.response as any;
    if (resp && typeof resp === "object" && typeof resp.raw === "string") {
      parseErrors += 1;
      continue;
    }
    if (!resp || !Array.isArray(resp.actions)) continue;
    ok += 1;
    if (passOnlyActions(resp.actions)) passOnly += 1;
    if (!provider || !model) {
      const info = resp.agent_info;
      if (info && typeof info === "object") {
        if (!provider && typeof info.provider === "string") provider = info.provider;
        if (!model && typeof info.model === "string") model = info.model;
      }
    }
  }

  latencies.sort((a, b) => a - b);
  const avg = latencies.length ? Math.round(latencies.reduce((s, x) => s + x, 0) / latencies.length) : null;
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);
  const max = latencies.length ? latencies[latencies.length - 1] : null;

  return {
    matchId,
    player,
    provider,
    model,
    totalPlies,
    ok,
    passOnly,
    httpErrors,
    parseErrors,
    timeouts,
    otherErrors,
    latencyMs: { avg, p50, p95, max },
  };
}

function formatTextRow(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
}

async function main() {
  const args = parseArgs(process.argv);
  const rootDir = args.get("--dir") ?? "runs/agent_io";
  const matchFilter = args.get("--match");
  const format = (args.get("--format") ?? "text").toLowerCase();
  const limit = Number.parseInt(args.get("--limit") ?? "50", 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limit must be an integer in [1, 500]");
  if (!["text", "json"].includes(format)) throw new Error("--format must be text|json");

  const root = path.resolve(rootDir);
  const entriesByMatch = new Map<string, LoggedIo[]>();

  const matchDirs = (await readdir(root, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dirName of matchDirs) {
    if (matchFilter && !dirName.includes(matchFilter)) continue;
    const dir = path.join(root, dirName);
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isFile() && d.name.endsWith(".json") && d.name.startsWith("ply_"))
      .map((d) => d.name)
      .sort();

    for (const f of files) {
      const full = path.join(dir, f);
      let parsed: unknown;
      try {
        parsed = JSON.parse(await readFile(full, "utf8"));
      } catch {
        continue;
      }
      const io = coerceLoggedIo(parsed);
      if (!io) continue;
      const id = io.request.match_id || dirName;
      const list = entriesByMatch.get(id) ?? [];
      list.push(io);
      entriesByMatch.set(id, list);
    }
  }

  const summaries = Array.from(entriesByMatch.entries())
    .map(([id, list]) => summarizeMatch(id, list))
    .sort((a, b) => b.timeouts + b.otherErrors + b.httpErrors + b.parseErrors - (a.timeouts + a.otherErrors + a.httpErrors + a.parseErrors));

  if (format === "json") {
    console.log(JSON.stringify({ rootDir, matches: summaries.slice(0, limit) }, null, 2));
    return;
  }

  const rows = summaries.slice(0, limit).map((s) => [
    s.matchId,
    s.player ?? "",
    s.provider ?? "",
    s.model ?? "",
    String(s.totalPlies),
    String(s.ok),
    String(s.passOnly),
    String(s.timeouts),
    String(s.httpErrors),
    String(s.parseErrors),
    String(s.otherErrors),
    s.latencyMs.avg === null ? "" : String(s.latencyMs.avg),
    s.latencyMs.p95 === null ? "" : String(s.latencyMs.p95),
  ]);

  const header = ["matchId", "pl", "provider", "model", "plies", "ok", "pass", "timeouts", "http", "parse", "err", "latAvg", "latP95"];
  const all = [header, ...rows];
  const widths = header.map((_, col) => Math.min(60, Math.max(...all.map((r) => (r[col] ?? "").length))));

  console.log(formatTextRow(header, widths));
  console.log(formatTextRow(header.map((h) => "-".repeat(Math.max(3, Math.min(60, h.length)))), widths));
  for (const r of rows) console.log(formatTextRow(r, widths));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
