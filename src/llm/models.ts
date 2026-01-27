import { readFile } from "node:fs/promises";

export type OssModelsConfigV1 = {
  version: 1;
  updated_at?: string;
  sources?: string[];
  providers: Record<
    string,
    {
      priority: string[];
      allow?: string[];
      deny?: string[];
      denyPrefixes?: string[];
    }
  >;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadOssModelsConfig(filePath: string): Promise<OssModelsConfigV1> {
  const text = await readFile(filePath, "utf8");
  const json = JSON.parse(text) as unknown;
  if (!isObject(json)) throw new Error(`Invalid models config at ${filePath}: must be an object`);
  if (json.version !== 1) throw new Error(`Invalid models config at ${filePath}: version must be 1`);
  if (!isObject(json.providers)) throw new Error(`Invalid models config at ${filePath}: providers must be an object`);

  for (const [provider, entry] of Object.entries(json.providers)) {
    if (!isObject(entry)) throw new Error(`Invalid models config at ${filePath}: providers.${provider} must be an object`);
    if (!Array.isArray(entry.priority) || entry.priority.some((v) => typeof v !== "string" || v.length === 0)) {
      throw new Error(`Invalid models config at ${filePath}: providers.${provider}.priority must be string[]`);
    }
    if (entry.allow !== undefined) {
      if (!Array.isArray(entry.allow) || entry.allow.some((v) => typeof v !== "string" || v.length === 0)) {
        throw new Error(`Invalid models config at ${filePath}: providers.${provider}.allow must be string[]`);
      }
    }
    if ((entry as any).deny !== undefined) {
      const deny = (entry as any).deny;
      if (!Array.isArray(deny) || deny.some((v) => typeof v !== "string" || v.length === 0)) {
        throw new Error(`Invalid models config at ${filePath}: providers.${provider}.deny must be string[]`);
      }
    }
    if ((entry as any).denyPrefixes !== undefined) {
      const denyPrefixes = (entry as any).denyPrefixes;
      if (!Array.isArray(denyPrefixes) || denyPrefixes.some((v) => typeof v !== "string" || v.length === 0)) {
        throw new Error(`Invalid models config at ${filePath}: providers.${provider}.denyPrefixes must be string[]`);
      }
    }
  }

  return json as OssModelsConfigV1;
}

export function getProviderAllowlist(config: OssModelsConfigV1, provider: string): {
  priority: string[];
  allow: string[];
  deny: string[];
  denyPrefixes: string[];
} {
  const entry = config.providers[provider.toLowerCase()] ?? config.providers[provider];
  const priority = entry?.priority ?? [];
  const allow = entry?.allow ?? priority;
  const deny = entry?.deny ?? [];
  const denyPrefixes = entry?.denyPrefixes ?? [];
  return { priority, allow, deny, denyPrefixes };
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function extractModelIds(payload: unknown): string[] {
  if (!isObject(payload)) return [];
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

export async function fetchOpenAiCompatModelIds(params: { baseUrl: string; apiKey?: string }): Promise<string[]> {
  const url = normalizeBaseUrl(params.baseUrl) + "/models";
  const headers: Record<string, string> = {};
  if (params.apiKey) headers.authorization = `Bearer ${params.apiKey}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 400)}`);

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }

  return extractModelIds(payload);
}
