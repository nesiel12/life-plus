import "server-only";
import { runLessonPipelineSweep } from "@/lib/torah/lessons/pipeline";
import type { Job } from "@/lib/proactive/types";

// How long one sweep keeps starting new steps. Inside the cron route's
// maxDuration (300s) with room for the other jobs in its group; the local
// runner can raise it for a long backlog.
const DEFAULT_BUDGET_MS = 180_000;

function budgetMs(): number {
  const raw = Number(process.env.LESSON_PIPELINE_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MS;
}

/**
 * The background worker for מרחב תורה's lessons (שיעורים): advances every
 * lesson that is pending, transcribing or analysing by as many resumable steps
 * as fit in the budget — see lib/torah/lessons/pipeline.ts.
 *
 * Global and self-ledgered: the work list is the lessons table itself, and
 * each lesson's lease and cursor are its idempotency. It must be safe to run
 * as often as a scheduler allows, and it is.
 */
export const lessonPipelineJob: Job = {
  name: "lesson_pipeline",
  scope: "global",
  ledger: "self",
  async run() {
    const result = await runLessonPipelineSweep(budgetMs());
    return { itemsProduced: result.steps, detail: result };
  },
};
