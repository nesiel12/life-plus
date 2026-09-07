import "server-only";
import { jobRunsRepo } from "@/lib/db/jobRuns";
import { listAllUserIds } from "@/lib/db/users";
import { logicalDayKey } from "@/lib/proactive/dedupe";
import type { JobName, Job } from "@/lib/proactive/types";

export type { Job, JobContext } from "@/lib/proactive/types";

/**
 * The job registry — lazy so running one job never loads another's dependency
 * graph (daily_insight pulls in the whole Context Engine; recommendation_expiry
 * touches two repos). Each job is added here as it's implemented — see
 * docs/PROACTIVE_ENGINE.md §3.
 */
export const JOB_LOADERS: Partial<Record<JobName, () => Promise<Job>>> = {
  recommendation_expiry: () =>
    import("@/lib/proactive/jobs/recommendationExpiry").then((m) => m.recommendationExpiryJob),
  daily_insight: () => import("@/lib/proactive/jobs/dailyInsight").then((m) => m.dailyInsightJob),
  morning_briefing: () =>
    import("@/lib/proactive/jobs/morningBriefing").then((m) => m.morningBriefingJob),
  reminder_sweep: () => import("@/lib/proactive/jobs/reminderSweep").then((m) => m.reminderSweepJob),
  busy_week_scan: () => import("@/lib/proactive/jobs/busyWeekScan").then((m) => m.busyWeekScanJob),
  schedule_transition: () =>
    import("@/lib/proactive/jobs/scheduleTransition").then((m) => m.scheduleTransitionJob),
  notification_dispatch: () =>
    import("@/lib/proactive/jobs/notificationDispatch").then((m) => m.notificationDispatchJob),
};

/** The job names that currently have an implementation. */
export const IMPLEMENTED_JOBS = Object.keys(JOB_LOADERS) as JobName[];

export interface RunJobSummary {
  job: JobName;
  scopesAttempted: number;
  scopesRun: number;
  scopesSkipped: number;
  scopesFailed: number;
  itemsProduced: number;
}

/**
 * Run one job for every due scope. Never throws — a scope that fails is
 * recorded as `failed` in `job_runs` and the sweep continues. Safe to call
 * twice for the same logical day: already-succeeded scopes are skipped by the
 * `job_runs` unique index.
 */
export async function runJob(name: JobName, now: Date = new Date()): Promise<RunJobSummary> {
  const loader = JOB_LOADERS[name];
  if (!loader) {
    return { job: name, scopesAttempted: 0, scopesRun: 0, scopesSkipped: 0, scopesFailed: 0, itemsProduced: 0 };
  }
  const job = await loader();

  const logicalDay = logicalDayKey(now);
  const scopeKeys = job.scope === "global" ? ["global"] : await listAllUserIds();

  const summary: RunJobSummary = {
    job: name,
    scopesAttempted: scopeKeys.length,
    scopesRun: 0,
    scopesSkipped: 0,
    scopesFailed: 0,
    itemsProduced: 0,
  };

  const ledger = job.ledger ?? "job_runs";

  for (const scopeKey of scopeKeys) {
    const ctx = {
      userId: job.scope === "per_user" ? scopeKey : undefined,
      logicalDay,
      now,
    };

    // Self-ledgered jobs run every sweep and carry their own idempotency in
    // their own data (a `sent_at` stamp, a conditional `reminded_at` update).
    // Claiming a day-grained job_runs row for them would let the first run of
    // the day block every later one — exactly backwards.
    if (ledger === "self") {
      try {
        const result = await job.run(ctx);
        summary.scopesRun++;
        summary.itemsProduced += result.itemsProduced;
      } catch (err) {
        console.error(`[proactive] ${name} failed for ${scopeKey}:`, err);
        summary.scopesFailed++;
      }
      continue;
    }

    const runId = await jobRunsRepo.claim(name, scopeKey, logicalDay);
    if (!runId) {
      summary.scopesSkipped++;
      continue;
    }
    try {
      const result = await job.run(ctx);
      const status = result.status ?? "succeeded";
      await jobRunsRepo.finish(runId, status, result.itemsProduced, result.detail ?? {});
      if (status === "skipped") {
        // Not yet this user's hour. The run is recorded as skipped, which
        // jobRunsRepo.claim treats as re-claimable, so a later invocation
        // today can still do the work.
        summary.scopesSkipped++;
      } else {
        summary.scopesRun++;
      }
      summary.itemsProduced += result.itemsProduced;
    } catch (err) {
      await jobRunsRepo.finish(runId, "failed", 0, {
        error: err instanceof Error ? err.message : String(err),
      });
      summary.scopesFailed++;
    }
  }

  return summary;
}
