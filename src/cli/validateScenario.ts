import { loadScenarioFromFile } from "../scenario/loadScenario.js";

const scenarioPath = process.argv[2];
if (!scenarioPath) {
  console.error("Usage: validateScenario <path-to-scenario.json>");
  process.exitCode = 2;
} else {
  await loadScenarioFromFile(scenarioPath);
  console.log(`OK: ${scenarioPath}`);
}

