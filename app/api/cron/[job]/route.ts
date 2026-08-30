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
];

// The single external trigger for the Proactive Engine. Driven by Vercel Cron
// or Supabase pg_cron (deploy-time choice — see docs/PROACTIVE_ENGINE.md §4).
// Auth is a shared secret, not a user session: this runs for all users.
export async function POST(request: Request, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { job } = await params;
  if (!VALID_JOBS.includes(job as JobName)) {
    return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });
  }

  const summary = await runJob(job as JobName);
  return NextResponse.json(summary);
}
