import type { RankedSignal } from "@/lib/intelligence/core/types";

const LOW_CONFIDENCE_THRESHOLD = 0.5;
const DEFAULT_LIMIT = 12;

// Stage 5 of the pipeline (docs/ATLAS_ARCHITECTURE_VISION.md §9) — the one
// place ranked signals become prompt text. Prompt builders (chatSystemPrompt,
// the goal-breakdown/Torah-extraction routes) call this instead of deciding
// their own section order; this function only renders what rankSignals
// already decided matters most. Low-confidence signals get an inline hedge
// so a weak inference is never presented with the same certainty as a
// dated calendar event.
export function formatSignalsForPrompt(rankedSignals: RankedSignal[], limit = DEFAULT_LIMIT): string {
  return rankedSignals
    .slice(0, limit)
    .map((signal) => {
      const hedge = signal.confidence < LOW_CONFIDENCE_THRESHOLD ? " (ביטחון נמוך)" : "";
      return `- ${signal.summary}${hedge}`;
    })
    .join("\n");
}
