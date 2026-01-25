import { validateJsonFileWithSchema } from "../lib/jsonSchema.js";

const replayPath = process.argv[2];
if (!replayPath) {
  console.error("Usage: validateReplay <path-to-replay.json>");
  process.exitCode = 2;
} else {
  await validateJsonFileWithSchema(replayPath, "schemas/replay.schema.json");
  console.log(`OK: ${replayPath}`);
}

