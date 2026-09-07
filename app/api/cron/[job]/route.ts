import { NextResponse } from "next/server";
import { runJob } from "@/lib/proactive/runJob";
import type { JobName } from "@/lib/proactive/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const VALID_JOBS: JobName[] = [
  "daily_insight",
  "morning_briefing",
  "reminder_sweep",
  "recommendation_expiry",
  "busy_week_scan",
  "notification_dispatch",
  "schedule_transition",
  "recovery_support",
  "relationship_nudge",
];

/**
 * Named sequences, so one scheduler slot can drive a whole cycle.
 *
 * This exists because of a hard external constraint: Vercel's free tier
 * allows two cron entries, each at most once a day. Producing a notification
 * and delivering it are separate jobs by design (see lib/notify/index.ts), so
 * a one-job-per-slot scheduler would generate briefings that never get
 * emailed. Grouping keeps the job boundaries intact while fitting the slots
 * actually available.
 *
 * Order matters: producers run before the dispatcher, so anything created in
 * this cycle goes out in the same cycle rather than waiting for the next one.
 */
const JOB_GROUPS: Record<string, JobName[]> = {
  // The morning cycle. Schedule so it lands inside the user's local
  // 07:00–11:00 window — morning_briefing self-gates and will skip outside it.
  daily: [
    "recommendation_expiry",
    "daily_insight",
    "morning_briefing",
    "relationship_nudge",
    "reminder_sweep",
    "schedule_transition",
    "recovery_support",
    "notification_dispatch",
  ],
  // A lighter pass for later in the day: fires reminders whose window opened
  // since the morning run, and delivers anything the morning's quiet hours
  // deferred.
  sweep: ["reminder_sweep", "schedule_transition", "recovery_support", "notification_dispatch"],
  // Weekly.
  weekly: ["busy_week_scan", "notification_dispatch"],
};

// The single external trigger for the Proactive Engine. Auth is a shared
// secret, not a user session: this runs for all users.
//
// Vercel Cron issues GET and injects `Authorization: Bearer $CRON_SECRET`
// automatically when an env var of exactly that name exists — which is why
// both verbs are exported and both check the same header. POST is kept for
// scripts/cron.ts and manual curl.
async function handle(request: Request, params: Promise<{ job: string }>) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await params;

  const sequence = JOB_GROUPS[job] ?? (VALID_JOBS.includes(job as JobName) ? [job as JobName] : null);
  if (!sequence) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });
  }

  // Sequential, not parallel: the dispatcher must observe what the producers
  // just wrote, and running every job's DB work at once against one Supabase
  // connection pool buys nothing.
  const summaries = [];
  for (const name of sequence) {
    summaries.push(await runJob(name));
  }

  return NextResponse.json({ group: job, ran: summaries });
}

export async function GET(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}

export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  return handle(request, params);
}
