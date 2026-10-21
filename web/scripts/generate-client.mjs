import { readFile, writeFile, mkdir } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";

const input = new URL("../../contracts/openapi.json", import.meta.url);
const output = new URL("../src/lib/api/schema.ts", import.meta.url);
const schema = JSON.parse(await readFile(input, "utf8"));
const source = "// Generated from contracts/openapi.json; run npm run generate:api.\n" +
  astToString(await openapiTS(schema, { defaultNonNullable: false }));
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== source) {
    throw new Error("Stale TypeScript API types; run npm run generate:api.");
  }
} else {
  await mkdir(new URL("../src/lib/api/", import.meta.url), { recursive: true });
  await writeFile(output, source, "utf8");
}
