import "server-only";
import { jobRunsRepo } from "@/lib/db/jobRuns";
import { listAllUserIds } from "@/lib/db/users";
import { logicalDayKey } from "@/lib/proactive/dedupe";
import type { JobName, JobResult, JobScope } from "@/lib/proactive/types";

export interface JobContext {
  /** Present only for `per_user` jobs. */
  userId?: string;
  /** YYYY-MM-DD the run is logically for. */
  logicalDay: string;
  now: Date;
}

export interface Job {
  name: JobName;
  scope: JobScope;
  run(ctx: JobContext): Promise<JobResult>;
}

/**
 * The job registry. Each job is added here as it's implemented — see
 * docs/PROACTIVE_ENGINE.md §3. Deliberately empty at M2 scaffold time so the
 * plumbing (idempotency, fan-out, error capture) can be reviewed and tested
 * before any job logic lands.
 */
export const JOBS: Partial<Record<JobName, Job>> = {};

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
  const job = JOBS[name];
  if (!job) {
    return { job: name, scopesAttempted: 0, scopesRun: 0, scopesSkipped: 0, scopesFailed: 0, itemsProduced: 0 };
  }

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
