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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function extractModelIds(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const p = payload as any;
  const candidates = p.data ?? p.models ?? p.items ?? p.result ?? p;
  if (!Array.isArray(candidates)) return [];
  const ids: string[] = [];
  for (const item of candidates) {
    const id = item?.id ?? item?.name ?? item?.model;
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return Array.from(new Set(ids)).sort();
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

  const baseUrl = args.get("--base-url") ?? getEnv(`ASG_${providerName.toUpperCase()}_BASE_URL`) ?? getEnv("ASG_OPENAI_BASE_URL") ?? "";
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

  const finalBaseUrl = baseUrl || keys.get(providerBaseUrlName) || "";
  if (!finalBaseUrl) throw new Error("Missing --base-url (or ASG_<PROVIDER>_BASE_URL / ASG_OPENAI_BASE_URL / --keys-file)");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be an integer >= 1");
  if (!["text", "json"].includes(format)) throw new Error("--format must be text|json");

  const url = normalizeBaseUrl(finalBaseUrl) + "/models";
  const headers: Record<string, string> = {};
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 400)}`);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }

  let ids = extractModelIds(payload);
  if (filter) ids = ids.filter((id) => id.toLowerCase().includes(filter.toLowerCase()));

  if (format === "json") {
    console.log(JSON.stringify({ provider: providerName, baseUrl: finalBaseUrl, count: ids.length, ids }, null, 2));
    return;
  }

  const shown = outAll ? ids : ids.slice(0, limit);
  console.log(`provider=${providerName}`);
  console.log(`baseUrl=${finalBaseUrl}`);
  console.log(`count=${ids.length}`);
  for (const id of shown) console.log(id);
  if (!outAll && ids.length > shown.length) console.log(`... (use --all or increase --limit)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
