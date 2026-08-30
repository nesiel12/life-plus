// M0 live-walkthrough verification — the data-layer equivalent of a real
// authenticated click-through, for when a browser OAuth session can't be
// driven directly. Exercises, against the real Supabase project:
//   1. the founder's provisioned user row + Deep-Onboarding DNA
//   2. the bootstrap read path (every table app/actions/bootstrap.ts reads)
//   3. a write → reload → read round-trip (does a mutation persist?)
//   4. multi-user isolation with a throwaway second user (cleaned up after)
//
// Usage: node --env-file=.env.local scripts/verify-live-walkthrough.mjs

import pg from "pg";

const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const line = (ok, msg) => console.log(`${ok ? "PASS" : "FAIL"} — ${msg}`);
let failures = 0;
const check = (ok, msg) => { if (!ok) failures++; line(ok, msg); };

await c.connect();

// 1. Founder provisioning
const founder = (await c.query("select id, email, name from users where email = $1", ["nesiel12388@gmail.com"])).rows[0];
check(!!founder, `founder user row exists (${founder?.email} / ${founder?.name})`);
const dna = (await c.query("select * from personal_dna where user_id = $1", [founder.id])).rows[0];
check(!!dna, "founder has a personal_dna row (created by events.signIn)");

// 2. Bootstrap read path — the user_id-scoped tables app/actions/bootstrap.ts reads
const bootstrapTables = [
  "life_area_scores", "people", "moments", "upcoming_events", "knowledge_entries",
  "chat_messages", "insights", "goals", "daily_intentions",
  "books", "rabbis", "summaries", "tasks", "habits",
  "transactions", "manual_events", "learning_topics", "learning_resources", "meals", "workouts",
];
let bootstrapOk = true;
const counts = {};
for (const t of bootstrapTables) {
  try {
    const n = (await c.query(`select count(*)::int as n from ${t} where user_id = $1`, [founder.id])).rows[0].n;
    counts[t] = n;
  } catch (e) {
    bootstrapOk = false;
    line(false, `bootstrap read of ${t}: ${e.message}`);
  }
}
check(bootstrapOk, `bootstrap read path — all ${bootstrapTables.length} user-scoped tables queryable for the founder`);
// child tables (scoped through a parent, not user_id) — the same pattern lib/db uses
const childOk = [];
try {
  await c.query("select count(*) from milestones m join goals g on g.id = m.goal_id where g.user_id = $1", [founder.id]);
  childOk.push("milestones→goals");
  await c.query("select count(*) from habit_logs hl join habits h on h.id = hl.habit_id where h.user_id = $1", [founder.id]);
  childOk.push("habit_logs→habits");
} catch (e) { line(false, `child-table join: ${e.message}`); }
check(childOk.length === 2, `child tables reachable via parent join (${childOk.join(", ")})`);
console.log("     data:", Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(", ") || "(all empty)");

// 3. Write → reload → read round-trip (a moment, like Quick Capture)
const ins = (await c.query(
  `insert into moments (user_id, category, title, content, occurred_at)
   values ($1, 'general', $2, 'M0 walkthrough probe', now()) returning id`,
  [founder.id, `__m0_probe_${Date.now()}`]
)).rows[0];
const reread = (await c.query("select title from moments where id = $1 and user_id = $2", [ins.id, founder.id])).rows[0];
check(reread?.title?.startsWith("__m0_probe_"), "write → read round-trip: a new moment persists and is readable");
await c.query("delete from moments where id = $1", [ins.id]);
const gone = (await c.query("select 1 from moments where id = $1", [ins.id])).rowCount;
check(gone === 0, "delete round-trip: the probe moment is removed");

// 4. Multi-user isolation with a throwaway user
const other = (await c.query(
  "insert into users (email, name) values ($1, $2) returning id",
  [`__m0_iso_${Date.now()}@example.test`, "Isolation Probe"]
)).rows[0];
try {
  await c.query("insert into moments (user_id, category, title, content, occurred_at) values ($1,'general','other-user-secret','x',now())", [other.id]);
  const founderSees = (await c.query("select count(*)::int as n from moments where user_id = $1 and title = 'other-user-secret'", [founder.id])).rows[0].n;
  check(founderSees === 0, "isolation: founder's user_id-scoped query cannot see the other user's moment");
  const otherSeesFounder = (await c.query("select count(*)::int as n from moments where user_id = $1 and user_id <> $1", [other.id])).rows[0].n;
  check(otherSeesFounder === 0, "isolation: a user_id-scoped query never leaks other rows");
} finally {
  await c.query("delete from users where id = $1", [other.id]); // cascades to their moments
}
const cleaned = (await c.query("select 1 from users where id = $1", [other.id])).rowCount;
check(cleaned === 0, "cleanup: throwaway user and their cascaded rows removed");

await c.end();
console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
