import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateJsonFileWithSchema } from "../lib/jsonSchema.js";
import { validateScenarioReferentialIntegrity } from "./validateScenario.js";
import type { Scenario } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadScenarioFromFile(scenarioPath: string): Promise<Scenario> {
  const schemaPath = path.resolve(__dirname, "../../schemas/scenario.schema.json");
  const scenario = await validateJsonFileWithSchema<Scenario>(scenarioPath, schemaPath);
  validateScenarioReferentialIntegrity(scenario);
  return scenario;
}

