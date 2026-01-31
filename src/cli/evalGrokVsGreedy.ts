import { spawn } from "node:child_process";
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

function nowStampPacific(): string {
  // Good enough; avoid depending on system TZ config.
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function main() {
  const args = parseArgs(process.argv);

  const start = Number.parseInt(args.get("--start") ?? "3", 10);
  const count = Number.parseInt(args.get("--count") ?? "3", 10);
  const unsafeAllowLong = (args.get("--unsafe-allow-long") ?? "false").toLowerCase() === "true";
  const turnCapPlies = Number.parseInt(args.get("--turn-cap-plies") ?? "30", 10);
  const agentSide = args.get("--agent-side") ?? "P1";
  const keysFile = args.get("--keys-file") ?? "secrets/provider_apis.txt";
  const baseUrl = args.get("--base-url") ?? "https://openrouter.ai/api/v1";
  const outDir = args.get("--out-dir") ?? path.join("replays", "model_evals", `grok_vs_greedy_${nowStampPacific()}`);
  const dryRun = (args.get("--dry-run") ?? "false").toLowerCase() === "true";

  if (!Number.isInteger(start) || start < 0) throw new Error("--start must be an integer >= 0");
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("--count must be an integer in [1, 3] (cost cap)");
  if (!Number.isInteger(turnCapPlies) || turnCapPlies < 1) throw new Error("--turn-cap-plies must be an integer >= 1");
  if (turnCapPlies > 30 && !unsafeAllowLong) {
    throw new Error("Policy: --turn-cap-plies must be <= 30 on v0/v0.x (pass --unsafe-allow-long true to override).");
  }
  if (agentSide !== "P1" && agentSide !== "P2") throw new Error("--agent-side must be P1 or P2");

  const tsxBin = path.resolve("node_modules/.bin/tsx");
  const cmdArgs = [
    "src/cli/agentVsRandom.ts",
    "--provider-name",
    "openrouter",
    "--base-url",
    baseUrl,
    "--keys-file",
    keysFile,
    "--model",
    "x-ai/grok-4.1-fast",
    "--opponent",
    "greedy",
    "--agent-side",
    agentSide,
    "--start",
    String(start),
    "--count",
    String(count),
    "--turn-cap-plies",
    String(turnCapPlies),
    ...(unsafeAllowLong ? (["--unsafe-allow-long", "true"] as const) : ([] as const)),
    "--save-replays",
    "true",
    "--out-dir",
    outDir,
    "--tag",
    "grok_vs_greedy",
  ];

  if (dryRun) {
    console.log([tsxBin, ...cmdArgs].join(" "));
    return;
  }

  const child = spawn(tsxBin, cmdArgs, { stdio: "inherit" });
  const code: number = await new Promise((resolve) => child.on("close", (c) => resolve(c ?? 1)));
  process.exitCode = code;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
