import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

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

type Row = {
  provider: string;
  model: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  avgProviderErrorTurns: number | null;
  avgAgentPassTurns: number | null;
  avgAgentErrorTurns: number | null;
  avgLatencyOkMs: number | null;
  p95LatencyOkMs: number | null;
};

function parseResult(value: unknown): "win" | "draw" | "loss" | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (!v) return null;
  if (v === "win" || v.startsWith("win_")) return "win";
  if (v === "loss" || v.startsWith("loss")) return "loss";
  if (v === "draw" || v.startsWith("draw")) return "draw";
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function mean(values: Array<number | null>): number | null {
  const xs = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function formatTextRow(cells: string[], widths: number[]): string {
  return cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  const root = path.resolve(dir);
  const items = await readdir(root, { withFileTypes: true });
  return items
    .filter((d) => d.isFile() && d.name.endsWith(".jsonl"))
    .map((d) => path.join(root, d.name))
    .sort();
}

async function readJsonlRows(filePath: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(filePath, "utf8");
  const out: Array<Record<string, unknown>> = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    out.push(parsed);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const inArg = args.get("--in");
  const dirArg = args.get("--dir") ?? "runs/live";
  const outPath = args.get("--out");
  const format = (args.get("--format") ?? "md").toLowerCase();
  const limit = Number.parseInt(args.get("--limit") ?? "100", 10);

  if (!["md", "text", "json"].includes(format)) throw new Error("--format must be md|text|json");
  if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error("--limit must be an integer in [1, 5000]");

  const inputs: string[] = [];
  if (inArg) {
    for (const part of inArg.split(",").map((s) => s.trim()).filter(Boolean)) {
      inputs.push(path.resolve(part));
    }
  } else {
    inputs.push(...(await listJsonlFiles(dirArg)));
  }
  if (inputs.length === 0) throw new Error("No inputs found");

  const byKey = new Map<
    string,
    {
      provider: string;
      model: string;
      results: Array<"win" | "draw" | "loss">;
      providerErrorTurns: Array<number | null>;
      agentPassTurns: Array<number | null>;
      agentErrorTurns: Array<number | null>;
      avgLatencyOkMs: Array<number | null>;
      p95LatencyOkMs: Array<number | null>;
    }
  >();

  for (const file of inputs) {
    const rows = await readJsonlRows(file);
    for (const r of rows) {
      const provider = typeof r.provider === "string" ? r.provider : null;
      const model = typeof r.model === "string" ? r.model : null;
      if (!provider || !model) continue;
      const result = parseResult(r.result);
      if (!result) continue;

      const key = `${provider}||${model}`;
      const entry =
        byKey.get(key) ??
        {
          provider,
          model,
          results: [],
          providerErrorTurns: [],
          agentPassTurns: [],
          agentErrorTurns: [],
          avgLatencyOkMs: [],
          p95LatencyOkMs: [],
        };

      entry.results.push(result);
      entry.providerErrorTurns.push(coerceNumber((r as any).providerErrorTurns));
      entry.agentPassTurns.push(coerceNumber((r as any).agentPassTurns));
      entry.agentErrorTurns.push(coerceNumber((r as any).agentErrorTurns));
      entry.avgLatencyOkMs.push(coerceNumber((r as any).avgLatencyOkMs));
      entry.p95LatencyOkMs.push(coerceNumber((r as any).p95LatencyOkMs));

      byKey.set(key, entry);
    }
  }

  const rows: Row[] = Array.from(byKey.values()).map((e) => {
    const games = e.results.length;
    const wins = e.results.filter((r) => r === "win").length;
    const draws = e.results.filter((r) => r === "draw").length;
    const losses = e.results.filter((r) => r === "loss").length;
    const winRate = games > 0 ? wins / games : 0;
    return {
      provider: e.provider,
      model: e.model,
      games,
      wins,
      draws,
      losses,
      winRate,
      avgProviderErrorTurns: mean(e.providerErrorTurns),
      avgAgentPassTurns: mean(e.agentPassTurns),
      avgAgentErrorTurns: mean(e.agentErrorTurns),
      avgLatencyOkMs: mean(e.avgLatencyOkMs),
      p95LatencyOkMs: mean(e.p95LatencyOkMs),
    };
  });

  rows.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    const aErr = a.avgProviderErrorTurns ?? Number.POSITIVE_INFINITY;
    const bErr = b.avgProviderErrorTurns ?? Number.POSITIVE_INFINITY;
    if (aErr !== bErr) return aErr - bErr;
    const aPass = a.avgAgentPassTurns ?? Number.POSITIVE_INFINITY;
    const bPass = b.avgAgentPassTurns ?? Number.POSITIVE_INFINITY;
    if (aPass !== bPass) return aPass - bPass;
    const aLat = a.p95LatencyOkMs ?? a.avgLatencyOkMs ?? Number.POSITIVE_INFINITY;
    const bLat = b.p95LatencyOkMs ?? b.avgLatencyOkMs ?? Number.POSITIVE_INFINITY;
    if (aLat !== bLat) return aLat - bLat;
    return a.model.localeCompare(b.model);
  });

  const top = rows.slice(0, limit);

  let out = "";
  if (format === "json") {
    out = JSON.stringify({ inputs, rows: top }, null, 2);
  } else if (format === "text") {
    const header = ["provider", "model", "games", "W-D-L", "win", "provErr", "pass", "agentErr", "latAvg", "latP95"];
    const data = top.map((r) => [
      r.provider,
      r.model,
      String(r.games),
      `${r.wins}-${r.draws}-${r.losses}`,
      pct(r.winRate),
      r.avgProviderErrorTurns === null ? "—" : r.avgProviderErrorTurns.toFixed(2),
      r.avgAgentPassTurns === null ? "—" : r.avgAgentPassTurns.toFixed(2),
      r.avgAgentErrorTurns === null ? "—" : r.avgAgentErrorTurns.toFixed(2),
      r.avgLatencyOkMs === null ? "—" : String(Math.round(r.avgLatencyOkMs)),
      r.p95LatencyOkMs === null ? "—" : String(Math.round(r.p95LatencyOkMs)),
    ]);
    const all = [header, ...data];
    const widths = header.map((_, col) => Math.min(80, Math.max(...all.map((row) => (row[col] ?? "").length))));
    out += formatTextRow(header, widths) + "\n";
    out += formatTextRow(header.map((h) => "-".repeat(Math.max(3, h.length))), widths) + "\n";
    for (const row of data) out += formatTextRow(row, widths) + "\n";
  } else {
    // md
    const lines: string[] = [];
    lines.push("| provider | model | games | W-D-L | win | provErr | pass | agentErr | latAvg | latP95 |");
    lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const r of top) {
      lines.push(
        `| ${r.provider} | ${r.model} | ${r.games} | ${r.wins}-${r.draws}-${r.losses} | ${pct(r.winRate)} | ${
          r.avgProviderErrorTurns === null ? "—" : r.avgProviderErrorTurns.toFixed(2)
        } | ${r.avgAgentPassTurns === null ? "—" : r.avgAgentPassTurns.toFixed(2)} | ${
          r.avgAgentErrorTurns === null ? "—" : r.avgAgentErrorTurns.toFixed(2)
        } | ${r.avgLatencyOkMs === null ? "—" : String(Math.round(r.avgLatencyOkMs))} | ${
          r.p95LatencyOkMs === null ? "—" : String(Math.round(r.p95LatencyOkMs))
        } |`,
      );
    }
    out = lines.join("\n");
  }

  if (outPath) {
    const dir = path.dirname(outPath);
    if (dir && dir !== ".") await mkdir(dir, { recursive: true });
    await writeFile(outPath, out, "utf8");
  } else {
    console.log(out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

