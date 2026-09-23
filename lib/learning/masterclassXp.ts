// XP feedback for masterclass inline checkpoints (types/learning.ts's
// InlineCheckpoint), kept separate from lib/learning/xp.ts for the same
// reason types/learning.ts gives Masterclass content its own file rather
// than folding into the shared LearningTopic/LearningResource shapes: a
// materially different domain that would otherwise bloat a file everything
// else reads.
//
// Deliberately NOT part of xp.ts's labStats()/celebrationFor(): this XP is
// local feedback for answering a checkpoint (confetti + a chime + a floating
// "+15 XP" inside the open lesson), not a contributor to the app-wide XP
// ring LearningHub's header shows — that total stays exactly what
// lib/learning/xp.ts already computes from topics/resources. Still derived,
// never stored as a running counter: this reads the transition between two
// answer states (was it correct before? is it correct now?), not a
// cumulative number kept anywhere.

/** What answering one checkpoint correctly is worth, shown as a floating "+15 XP". */
export const CHECKPOINT_XP = 15;

export type CheckpointCelebration = "none" | "correct";

/**
 * Whether this answer is a wrong-to-correct transition worth celebrating.
 * Re-confirming an already-correct answer (a repeat "נסה שוב" that lands on
 * the same right choice) does not re-fire — the transition already happened
 * once, and celebrating a correct answer's second confirmation would make
 * "+15 XP" less honest than the label claims.
 */
export function checkpointCelebrationFor(input: { wasCorrectBefore: boolean; isCorrectNow: boolean }): CheckpointCelebration {
  if (!input.wasCorrectBefore && input.isCorrectNow) return "correct";
  return "none";
}
