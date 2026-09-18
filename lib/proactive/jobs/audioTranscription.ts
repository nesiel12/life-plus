import "server-only";
import { runAudioTranscriptionSweep } from "@/lib/torah/attachments/pipeline";
import type { Job } from "@/lib/proactive/types";

// How long one sweep keeps starting new steps. Inside the cron route's
// maxDuration (300s) with room for the other jobs in its group.
const DEFAULT_BUDGET_MS = 120_000;

function budgetMs(): number {
  const raw = Number(process.env.ATTACHMENT_SWEEP_BUDGET_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET_MS;
}

/**
 * The background worker for audio attached to books, rabbis, lessons, concepts
 * and notes: advances every recording whose transcription the user asked for.
 *
 * Global and self-ledgered, exactly like lesson_pipeline: the work list is the
 * entity_audio table itself, and each row's lease and window cursor are its
 * idempotency, so running this as often as a scheduler allows is safe.
 */
export const audioTranscriptionJob: Job = {
  name: "audio_transcription",
  scope: "global",
  ledger: "self",
  async run() {
    const result = await runAudioTranscriptionSweep(budgetMs());
    return { itemsProduced: result.steps, detail: result };
  },
};
