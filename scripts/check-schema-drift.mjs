// Compare the live DB schema against what types/database.ts expects (which
// mirrors the migration files). Flags every table where a Row type references
// a column the live table lacks — that's a PostgREST PGRST204 "could not find
// the 'X' column" error waiting to happen at runtime, which is exactly how the
// learning_topics / learning_resources drift surfaced on 2026-08-31 (an
// earlier, lost migration iteration had created a different shape and
// apply-migrations.mjs skipped the canonical one because _migrations already
// had the row).
//
// Run: npm run check:schema   (needs SUPABASE_DB_URL in .env.local)
// Exits non-zero on drift so it can gate CI / pre-deploy.
import pg from "pg";
import { readFileSync } from "fs";

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const live = {};
const rows = (await c.query(
  `select table_name, column_name, data_type from information_schema.columns
   where table_schema='public' order by table_name, ordinal_position`
)).rows;
for (const r of rows) (live[r.table_name] ??= {})[r.column_name] = r.data_type;

// crude parse of types/database.ts Row blocks
const src = readFileSync("types/database.ts", "utf8");
const tableRe = /(\w+):\s*TableDef<\s*\{([\s\S]*?)\},\s*\{/g;
let m;
const problems = [];
while ((m = tableRe.exec(src))) {
  const table = m[1];
  if (!live[table]) {
    problems.push(`TABLE MISSING: ${table} (in code, not in DB)`);
    continue;
  }
  const cols = [...m[2].matchAll(/^\s*(\w+):/gm)].map((x) => x[1]);
  for (const col of cols) {
    if (!(col in live[table])) {
      problems.push(`${table}.${col} — code expects it, live DB does not have it`);
    }
  }
}

// Flag user_id type mismatches (should be uuid everywhere) — a `text` user_id
// means an FK to users(id) was silently dropped, another drift signature.
const badUserId = Object.entries(live)
  .filter(([, cols]) => cols.user_id && cols.user_id !== "uuid")
  .map(([t, cols]) => `${t}.user_id is ${cols.user_id} (expected uuid)`);

await c.end();

if (problems.length === 0 && badUserId.length === 0) {
  console.log("No drift: every column in types/database.ts Row types exists in the live DB.");
  process.exit(0);
}
if (problems.length) {
  console.log(`${problems.length} drift issue(s):\n` + problems.map((p) => "  - " + p).join("\n"));
}
if (badUserId.length) {
  console.log("\nuser_id type mismatches:\n" + badUserId.map((s) => "  - " + s).join("\n"));
}
process.exit(1);
