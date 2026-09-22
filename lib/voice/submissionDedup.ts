// The decision behind hooks/useVoiceAssistant.ts's double-submission guard,
// pulled out as a pure function so it's unit-testable without React: given
// whether a submission is already in flight and what was last submitted,
// should this new one be rejected as a likely duplicate?
//
// The bug this exists to prevent: SpeechRecognition's onEnd firing twice for
// one browser session (fixed at its source in lib/voice/speechRecognition.ts
// — Chrome routinely fires both onerror and onend for the same terminated
// session) meant the same finalized transcript reached converse() twice.
// This stays as a second, independent layer: nothing guarantees a duplicate
// onEnd is the only way two calls could ever race for the same utterance.

export interface LastSubmission {
  text: string;
  /** Epoch ms. */
  at: number;
}

export interface DuplicateSubmissionCheck {
  text: string;
  isSubmitting: boolean;
  lastSubmission: LastSubmission | null;
  /** Epoch ms "now" — injected rather than read internally, so this stays pure and testable without faking the clock. */
  now: number;
  /** How long an identical transcript stays rejected as a likely duplicate. */
  windowMs: number;
}

/**
 * True if this submission should be silently dropped: one is already being
 * processed, or the exact same text was just submitted within `windowMs`.
 * A different text, or the same text after the window has passed (a
 * legitimate "כן" said again a minute later), returns false.
 */
export function isDuplicateSubmission({ text, isSubmitting, lastSubmission, now, windowMs }: DuplicateSubmissionCheck): boolean {
  if (isSubmitting) return true;
  if (!lastSubmission) return false;
  if (lastSubmission.text !== text) return false;
  return now - lastSubmission.at < windowMs;
}
