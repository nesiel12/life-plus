import { deckProgress, masteryTier, type MasteryTier, type SrsState } from "@/lib/torah/srs";
import { topicProgress } from "@/lib/learning/xp";
import type { LearningResource } from "@/types";

// ציון שליטה בנושא — one 0-100 number for "how well do I actually know this
// topic", combining the three kinds of evidence the lab has:
//
//   syllabus  — resources marked done (lib/learning/xp.ts topicProgress).
//               Exposure: you went through the material.
//   quizzes   — recent quiz scores. Recall under test conditions, right now.
//   deck      — flashcard mastery (lib/torah/srs.ts deckProgress, reused
//               whole). Retention over time — the thing spaced repetition is
//               actually for.
//
// Weighted, not averaged blindly: a syllabus with no quiz and no cards yet
// should not show "0% mastery" (that reads as "you know nothing", which is
// false — you have not been *tested* yet, which is different) — it should
// read as modest-but-real progress. So evidence you have none of is left out
// of the weighting entirely, and what you do have is renormalised across
// itself, rather than diluted by zeros for sources that were never attempted.

export interface MasteryInputs {
  resources: readonly Pick<LearningResource, "isCompleted">[];
  /** Most recent first; only the recent window actually counts (see RECENT_QUIZZES). */
  quizFractions: readonly number[];
  flashcards: readonly Pick<SrsState, "repetitions" | "intervalDays">[];
}

export interface MasteryResult {
  /** 0..100, rounded to a whole number for display. */
  score: number;
  /** Which of the three sources actually contributed. */
  hasSyllabus: boolean;
  hasQuizzes: boolean;
  hasFlashcards: boolean;
  syllabusFraction: number;
  quizFraction: number | null;
  deckFraction: number | null;
  tier: MasteryLevel;
}

export type MasteryLevel = "not-started" | "beginner" | "developing" | "proficient" | "mastered";

const WEIGHT = { syllabus: 0.3, quizzes: 0.35, deck: 0.35 } as const;

/** Only the most recent attempts count — mastery is "how well do you know it
 *  now", not a lifetime batting average that a single early flop can't shake. */
const RECENT_QUIZZES = 5;

export function averageQuizFraction(quizFractionsMostRecentFirst: readonly number[]): number | null {
  const recent = quizFractionsMostRecentFirst.slice(0, RECENT_QUIZZES);
  if (recent.length === 0) return null;
  return recent.reduce((sum, f) => sum + f, 0) / recent.length;
}

export function masteryLevel(score: number): MasteryLevel {
  if (score <= 0) return "not-started";
  if (score < 35) return "beginner";
  if (score < 65) return "developing";
  if (score < 90) return "proficient";
  return "mastered";
}

export const MASTERY_LEVEL_LABELS: Record<MasteryLevel, string> = {
  "not-started": "טרם התחיל",
  beginner: "בתחילת הדרך",
  developing: "מתפתח",
  proficient: "שולט",
  mastered: "שליטה מלאה",
};

/**
 * The mastery score. Pure, and the only place the weighting lives, so
 * changing how much a quiz should count never means hunting through a
 * component for the number.
 */
export function computeMastery(input: MasteryInputs): MasteryResult {
  const progress = topicProgress(input.resources);
  const quizFraction = averageQuizFraction(input.quizFractions);
  const deckFraction = input.flashcards.length > 0 ? deckProgress([...input.flashcards]) : null;

  const hasSyllabus = progress.total > 0;
  const hasQuizzes = quizFraction !== null;
  const hasFlashcards = deckFraction !== null;

  const parts: { value: number; weight: number }[] = [];
  if (hasSyllabus) parts.push({ value: progress.fraction, weight: WEIGHT.syllabus });
  if (hasQuizzes) parts.push({ value: quizFraction!, weight: WEIGHT.quizzes });
  if (hasFlashcards) parts.push({ value: deckFraction!, weight: WEIGHT.deck });

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight) * 100);

  return {
    score,
    hasSyllabus,
    hasQuizzes,
    hasFlashcards,
    syllabusFraction: progress.fraction,
    quizFraction,
    deckFraction,
    tier: masteryLevel(score),
  };
}

// Re-exported so a caller that already imported this module for the score
// does not need a second import from lib/torah/srs.ts just to label one card.
export { masteryTier, type MasteryTier };
