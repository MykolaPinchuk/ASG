import {
  fetchOpenAiCompatModelIds,
  getProviderAllowlist,
  loadOssModelsConfig,
} from "../llm/models.js";

type OutputFormat = "text" | "json";

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

function parseKeysFile(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    const eq = line.indexOf("=");
    const splitAt = idx >= 0 ? idx : eq >= 0 ? eq : -1;
    if (splitAt < 0) continue;
    const k = line.slice(0, splitAt).trim().toLowerCase();
    const v = line.slice(splitAt + 1).trim();
    if (!k || !v) continue;
    out.set(k, v);
  }
  return out;
}

function getEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function guessKeyEnv(providerName: string): string {
  const upper = providerName.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return `${upper}_API_KEY`;
}

async function main() {
  const args = parseArgs(process.argv);
  const providerName = args.get("--provider") ?? "openrouter";
  const keysFilePath = args.get("--keys-file");
  const keys = keysFilePath
    ? parseKeysFile(await (await import("node:fs/promises")).readFile(keysFilePath, "utf8"))
    : new Map<string, string>();

  const providerKeyName = (args.get("--keys-name") ?? providerName).toLowerCase();
  const providerBaseUrlName = (args.get("--base-url-name") ?? `${providerName}_base_url`).toLowerCase();

  const cerebrasDefaultBaseUrl = providerName.toLowerCase() === "cerebras" ? "https://api.cerebras.ai/v1" : undefined;
  const baseUrl =
    args.get("--base-url") ??
    getEnv(`ASG_${providerName.toUpperCase()}_BASE_URL`) ??
    cerebrasDefaultBaseUrl ??
    getEnv("ASG_OPENAI_BASE_URL") ??
    "";
  const apiKey =
    args.get("--api-key") ??
    (args.get("--api-key-env") ? getEnv(args.get("--api-key-env")!) : undefined) ??
    getEnv(`ASG_${providerName.toUpperCase()}_API_KEY`) ??
    getEnv("ASG_OPENAI_API_KEY") ??
    getEnv(guessKeyEnv(providerName)) ??
    keys.get(providerKeyName);

  const format = (args.get("--format") ?? "text") as OutputFormat;
  const outAll = args.get("--all") === "true";
  const limit = Number.parseInt(args.get("--limit") ?? "50", 10);
  const filter = args.get("--filter") ?? "";
  const modelsConfigPath = args.get("--models-config") ?? getEnv("ASG_MODELS_CONFIG") ?? "";
  const modelsProvider = (args.get("--models-provider") ?? providerName).toLowerCase();
  const onlyAllowed = modelsConfigPath ? args.get("--only-allowed") !== "false" : false;

  const finalBaseUrl = baseUrl || keys.get(providerBaseUrlName) || "";
  if (!finalBaseUrl) throw new Error("Missing --base-url (or ASG_<PROVIDER>_BASE_URL / ASG_OPENAI_BASE_URL / --keys-file)");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be an integer >= 1");
  if (!["text", "json"].includes(format)) throw new Error("--format must be text|json");

  let ids = await fetchOpenAiCompatModelIds({ baseUrl: finalBaseUrl, apiKey: apiKey || undefined });
  if (filter) ids = ids.filter((id) => id.toLowerCase().includes(filter.toLowerCase()));

  let allow: string[] = [];
  let priority: string[] = [];
  let deny: string[] = [];
  let denyPrefixes: string[] = [];
  let availablePriority: string[] = [];
  let missingPriority: string[] = [];
  if (modelsConfigPath) {
    const config = await loadOssModelsConfig(modelsConfigPath);
    const lists = getProviderAllowlist(config, modelsProvider);
    allow = lists.allow;
    priority = lists.priority;
    deny = lists.deny;
    denyPrefixes = lists.denyPrefixes;
    const availableSet = new Set(ids);
    availablePriority = priority.filter((m) => availableSet.has(m));
    missingPriority = priority.filter((m) => !availableSet.has(m));
    if (onlyAllowed && allow.length > 0) {
      const allowSet = new Set(allow);
      ids = ids.filter((id) => allowSet.has(id));
    }
    if (deny.length > 0 || denyPrefixes.length > 0) {
      const denySet = new Set(deny);
      const denyPrefixesNorm = denyPrefixes.map((p) => p.toLowerCase());
      ids = ids.filter((id) => !denySet.has(id) && !denyPrefixesNorm.some((p) => id.toLowerCase().startsWith(p)));
    }
  }

  if (format === "json") {
    console.log(
      JSON.stringify(
        {
          provider: providerName,
          baseUrl: finalBaseUrl,
          count: ids.length,
          ids,
          modelsConfigPath: modelsConfigPath || undefined,
          modelsProvider: modelsConfigPath ? modelsProvider : undefined,
          onlyAllowed: modelsConfigPath ? onlyAllowed : undefined,
          allow: modelsConfigPath ? allow : undefined,
          priority: modelsConfigPath ? priority : undefined,
          availablePriority: modelsConfigPath ? availablePriority : undefined,
          missingPriority: modelsConfigPath ? missingPriority : undefined,
        },
        null,
        2,
      ),
    );
    return;
  }

  const shown = outAll ? ids : ids.slice(0, limit);
  console.log(`provider=${providerName}`);
  console.log(`baseUrl=${finalBaseUrl}`);
  console.log(`count=${ids.length}`);
  if (modelsConfigPath) {
    console.log(`modelsConfig=${modelsConfigPath}`);
    console.log(`modelsProvider=${modelsProvider}`);
    console.log(`onlyAllowed=${onlyAllowed}`);
    if (priority.length > 0) {
      console.log(`priorityAvailable=${availablePriority.length}/${priority.length}`);
      if (missingPriority.length > 0) console.log(`priorityMissing=${missingPriority.length}`);
    }
  }
  for (const id of shown) console.log(id);
  if (!outAll && ids.length > shown.length) console.log(`... (use --all or increase --limit)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
