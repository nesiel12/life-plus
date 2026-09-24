// Resets a user's AI quota for today — deletes their 'day' (and, unless
// --keep-minute is passed, 'minute') ai_usage rows for the current window.
// Nothing to "reset" in place: ai_usage is one row per (user, scope,
// window_start), a new window is just a new row, and old rows age out on
// their own (see the ai_usage migration's own header) — so a reset is a
// delete of the row(s) for *today's* window, not an update.
//
// This is a manual escape hatch for a person who got legitimately locked
// out of their own app (the free-tier daily cap, lib/ai/quota.ts). For a
// standing fix rather than a one-off, see AI_QUOTA_UNLIMITED_EMAILS
// (lib/ai/quota.ts's isQuotaExemptEmail) instead — that exempts an email
// from the quota entirely, going forward, rather than clearing one day.
//
// Usage: node --env-file=.env.local scripts/reset-ai-quota.mjs <email> [--transcription] [--keep-minute]
//   --transcription  also clears today's transcribe_day (audio-minutes) budget
//   --keep-minute    leaves the current-minute burst budget alone (rarely useful — it expires within 60s on its own)

import pg from "pg";

async function main() {
  const [email, ...flags] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: node --env-file=.env.local scripts/reset-ai-quota.mjs <email> [--transcription] [--keep-minute]");
    process.exit(1);
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("SUPABASE_DB_URL is not set.");
    process.exit(1);
  }

  const scopes = ["day"];
  if (!flags.includes("--keep-minute")) scopes.push("minute");
  if (flags.includes("--transcription")) scopes.push("transcribe_day");

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  const { rows: userRows } = await client.query("select id, email from users where lower(email) = lower($1)", [email]);
  if (userRows.length === 0) {
    console.error(`No user found for ${email}.`);
    await client.end();
    process.exit(1);
  }
  const { id: userId, email: realEmail } = userRows[0];

  // window_start truncation must match lib/ai/quota.ts's dayWindow/
  // minuteWindow exactly (UTC midnight / top of the UTC minute), or this
  // would delete the wrong row and leave today's real one in place.
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const minuteStart = new Date(now);
  minuteStart.setUTCSeconds(0, 0);

  const windowByScope = { day: dayStart, minute: minuteStart.toISOString(), transcribe_day: dayStart };

  let totalDeleted = 0;
  for (const scope of scopes) {
    const { rowCount } = await client.query("delete from ai_usage where user_id = $1 and scope = $2 and window_start = $3", [
      userId,
      scope,
      windowByScope[scope],
    ]);
    console.log(`${scope}: deleted ${rowCount} row(s)`);
    totalDeleted += rowCount;
  }

  console.log(`Done — ${realEmail} (${userId}): ${totalDeleted} row(s) cleared for today's window(s). They can use AI features again immediately.`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
