// Adaptive difficulty for written practice questions.
//
// Pure. After each graded answer the target difficulty moves one step: up
// after a strong answer, down after a weak one — the staircase method, which
// settles on the level where the learner succeeds about as often as they
// struggle. That level is where practice does the most good.

export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

export function nextDifficulty(current: number, score: number | null): number {
  const level = Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, Math.round(current)));
  if (score === null) return level;
  if (score >= 85) return Math.min(MAX_DIFFICULTY, level + 1);
  if (score < 50) return Math.max(MIN_DIFFICULTY, level - 1);
  return level;
}

/** A starting level from the learner's recent scores (newest last). */
export function startingDifficulty(recentScores: readonly number[]): number {
  const recent = recentScores.slice(-5);
  if (recent.length === 0) return 2;
  const average = recent.reduce((sum, s) => sum + s, 0) / recent.length;
  return average >= 85 ? 4 : average >= 70 ? 3 : average >= 50 ? 2 : 1;
}

/**
 * The unanswered question closest to the target level. Ties go to the harder
 * one — erring upward keeps the session from going stale.
 */
export function pickQuestion<T extends { id: string; difficulty: number }>(
  questions: readonly T[],
  answered: ReadonlySet<string>,
  target: number
): T | null {
  let best: T | null = null;
  for (const question of questions) {
    if (answered.has(question.id)) continue;
    if (!best) {
      best = question;
      continue;
    }
    const distance = Math.abs(question.difficulty - target);
    const bestDistance = Math.abs(best.difficulty - target);
    if (distance < bestDistance || (distance === bestDistance && question.difficulty > best.difficulty)) best = question;
  }
  return best;
}

/** Whether a part has been mastered well enough to offer a harder challenge. */
export function readyForChallenge(scores: readonly (number | null)[]): boolean {
  const graded = scores.filter((s): s is number => typeof s === "number");
  if (graded.length < 2) return false;
  return graded.reduce((sum, s) => sum + s, 0) / graded.length >= 80;
}
