import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { query, end } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(join(here, "schema.sql"), "utf8");

async function main() {
  await query("CREATE EXTENSION IF NOT EXISTS pgcrypto"); // gen_random_uuid()
  await query(schema);
  console.log("migrated");
  await end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
