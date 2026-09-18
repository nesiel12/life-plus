// Local runner for Proactive Engine jobs — the stand-in for a deployed
// scheduler (Vercel Cron / Supabase pg_cron) during development.
//
//   npm run cron -- daily_insight
//   npm run cron -- recommendation_expiry
//   npm run cron -- lesson_pipeline      (transcribe + analyse uploaded shiurim)
//   npm run cron -- audio_transcription  (transcribe recordings attached to entities)
//
// Runs the real runJob() code path against whatever SUPABASE_* / AI env is in
// .env.local. Safe to re-run: job_runs idempotency skips already-succeeded
// scopes for the logical day.

import { runJob } from "@/lib/proactive/runJob";
import type { JobName } from "@/lib/proactive/types";

const VALID: JobName[] = [
  "daily_insight",
  "morning_briefing",
  "reminder_sweep",
  "recommendation_expiry",
  "busy_week_scan",
  "notification_dispatch",
  "schedule_transition",
  "recovery_support",
  "relationship_nudge",
  "lesson_pipeline",
  "audio_transcription",
];

const job = process.argv[2] as JobName | undefined;
if (!job || !VALID.includes(job)) {
  console.error(`Usage: npm run cron -- <${VALID.join(" | ")}>`);
  process.exit(1);
}

runJob(job)
  .then((summary) => {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
