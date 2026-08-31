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
  // morning_briefing, reminder_sweep, busy_week_scan — next in M2
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

  for (const scopeKey of scopeKeys) {
    const runId = await jobRunsRepo.claim(name, scopeKey, logicalDay);
    if (!runId) {
      summary.scopesSkipped++;
      continue;
    }
    try {
      const result = await job.run({
        userId: job.scope === "per_user" ? scopeKey : undefined,
        logicalDay,
        now,
      });
      await jobRunsRepo.finish(runId, "succeeded", result.itemsProduced, result.detail ?? {});
      summary.scopesRun++;
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
