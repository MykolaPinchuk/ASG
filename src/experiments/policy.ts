import path from "node:path";
import { readFile } from "node:fs/promises";

export type ExperimentPolicy = {
  schemaVersion: "asg.experiment_policy.v1";
  defaultSeedProfile: string;
  seedProfiles: Record<string, number[]>;
  controlRerunEveryVariants: number;
};

const DEFAULT_POLICY: ExperimentPolicy = {
  schemaVersion: "asg.experiment_policy.v1",
  defaultSeedProfile: "smoke3",
  seedProfiles: {
    smoke3: [301, 302, 303],
  },
  controlRerunEveryVariants: 5,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asPositiveInts(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const item of value) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0) return [];
    out.push(item);
  }
  return out;
}

export async function loadExperimentPolicy(repoRoot: string): Promise<{
  policy: ExperimentPolicy;
  path: string;
}> {
  const policyPath = path.join(repoRoot, "experiments", "POLICY.json");
  try {
    const parsed = JSON.parse(await readFile(policyPath, "utf8"));
    if (!isObject(parsed)) {
      return { policy: DEFAULT_POLICY, path: policyPath };
    }
    const defaultSeedProfile =
      typeof parsed.defaultSeedProfile === "string" && parsed.defaultSeedProfile.length > 0
        ? parsed.defaultSeedProfile
        : DEFAULT_POLICY.defaultSeedProfile;
    const rawProfiles = isObject(parsed.seedProfiles) ? parsed.seedProfiles : {};
    const seedProfiles: Record<string, number[]> = {};
    for (const [name, seeds] of Object.entries(rawProfiles)) {
      const clean = asPositiveInts(seeds);
      if (clean.length > 0) seedProfiles[name] = clean;
    }
    if (Object.keys(seedProfiles).length === 0) {
      seedProfiles.smoke3 = DEFAULT_POLICY.seedProfiles.smoke3.slice();
    }
    const rerun = typeof parsed.controlRerunEveryVariants === "number" ? Math.floor(parsed.controlRerunEveryVariants) : NaN;
    const controlRerunEveryVariants = Number.isFinite(rerun) && rerun >= 1 ? rerun : DEFAULT_POLICY.controlRerunEveryVariants;
    return {
      path: policyPath,
      policy: {
        schemaVersion: "asg.experiment_policy.v1",
        defaultSeedProfile,
        seedProfiles,
        controlRerunEveryVariants,
      },
    };
  } catch {
    return { policy: DEFAULT_POLICY, path: policyPath };
  }
}

export function parseExperimentNumber(expId: string): number | null {
  const match = /^EXP_(\d+)_/.exec(expId);
  if (!match?.[1]) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isInteger(n) ? n : null;
}

export function isControlRerunDue(expId: string, cadence: number): boolean {
  const n = parseExperimentNumber(expId);
  if (n === null || cadence < 1) return false;
  return n > 0 && n % cadence === 0;
}
