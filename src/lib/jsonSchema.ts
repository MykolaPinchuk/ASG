import * as Ajv2020Module from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const ajv = new Ajv2020Module.Ajv2020({
  allErrors: true,
  strict: true,
  validateSchema: true,
});

export async function validateJsonFileWithSchema<T>(
  jsonPath: string,
  schemaPath: string,
): Promise<T> {
  const [jsonText, schemaText] = await Promise.all([
    readFile(jsonPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);

  const json = JSON.parse(jsonText) as Json;
  const schema = JSON.parse(schemaText) as object;

  const validate = ajv.compile(schema);
  const ok = validate(json);
  if (!ok) {
    const details = ajv.errorsText(validate.errors, { separator: "\n" });
    throw new Error(`Schema validation failed for ${jsonPath}:\n${details}`);
  }

  return json as unknown as T;
}
