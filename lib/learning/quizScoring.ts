// Quiz scoring for the Learning Hub's chapter quizzes.
//
// Pure, so the scoring rules are testable without an AI call or a rendered
// component — the same split every other derived-value module here uses.

export interface ScorableQuestion {
  correctIndex: number;
}

/** answers[i] is the option index chosen for question i; null = unanswered. */
export type QuizAnswers = (number | null)[];

/**
 * flagged[i] marks question i as deliberately set aside.
 *
 * A flag is not a wrong answer and not an unanswered one — it is "I do not
 * know this yet, let me move on". The distinction matters because the whole
 * point of the flag is to stop a single hard question from blocking the rest
 * of the course, and folding it into "wrong" would quietly punish the
 * learner for using it.
 */
export type QuizFlags = boolean[];

export interface QuizScore {
  correct: number;
  total: number;
  /** 0-100 of the whole quiz, rounded. Flagged questions count against it. */
  percent: number;
  answered: number;
  /** Questions set aside rather than answered. */
  skipped: number;
  allAnswered: boolean;
  /**
   * 0-100 over the questions actually attempted.
   *
   * Reported alongside `percent` rather than instead of it: "8/8 of what you
   * answered" is the honest encouragement, and "8/12 overall" is the honest
   * assessment. Showing only the first would let someone flag their way to a
   * perfect score.
   */
  attemptedPercent: number;
  /** Hebrew band label for the result. */
  label: string;
}

export function scoreQuiz(
  questions: ScorableQuestion[],
  answers: QuizAnswers,
  flagged: QuizFlags = []
): QuizScore {
  const total = questions.length;
  let correct = 0;
  let answered = 0;
  let skipped = 0;

  for (let i = 0; i < total; i++) {
    const choice = answers[i];
    if (choice === null || choice === undefined) {
      // Only an *unanswered* question can be skipped. Someone who answered
      // and then flagged has still attempted it, and their answer is graded.
      if (flagged[i]) skipped++;
      continue;
    }
    answered++;
    if (choice === questions[i].correctIndex) correct++;
  }

  // Guard both divides: a module with no quiz, or one entirely flagged,
  // must not produce NaN.
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const attemptedPercent = answered > 0 ? Math.round((correct / answered) * 100) : 0;

  return {
    correct,
    total,
    percent,
    answered,
    skipped,
    attemptedPercent,
    allAnswered: total > 0 && answered === total,
    label: scoreLabel(percent),
  };
}

/**
 * Bands chosen so the encouraging label isn't handed out for a failing
 * score — "כמעט שם" at 40% would be a lie the learner can check against
 * their own wrong answers.
 */
export function scoreLabel(percent: number): string {
  if (percent >= 90) return "שליטה מצוינת";
  if (percent >= 70) return "הבנה טובה";
  if (percent >= 50) return "כמעט שם";
  return "כדאי לחזור על החומר";
}

/**
 * True once every question is either answered or deliberately flagged.
 *
 * Gates submission. The stricter "every question answered" predicate this
 * replaced is what made one unanswerable question a dead end for the whole
 * course — the learner could neither finish the quiz nor get past it — and it
 * was deleted rather than kept, since nothing needs that meaning any more.
 */
export function isSubmittable(
  questions: ScorableQuestion[],
  answers: QuizAnswers,
  flagged: QuizFlags = []
): boolean {
  return (
    questions.length > 0 &&
    questions.every((_, i) => (answers[i] !== null && answers[i] !== undefined) || Boolean(flagged[i]))
  );
}

// ── Randomisation ─────────────────────────────────────────────────────────
//
// Shuffling questions and options each render stops the quiz being learnable
// by position ("the answer is always the third one"), which is the failure
// mode of a fixed-order multiple choice quiz.
//
// Two constraints shape this. It must be *seeded*, so the order is stable
// across re-renders — reshuffling on every keystroke would move an option
// out from under the user's cursor mid-click. And it must remap
// correctIndex, since shuffling options without doing so silently marks the
// wrong answer correct, which is far worse than not shuffling at all.

/**
 * Deterministic PRNG (mulberry32). Seeded rather than Math.random so a given
 * seed always yields the same order — that is what makes it stable per
 * attempt and testable here.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, on a copy — the caller's array is never mutated. */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface ShuffleableQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Shuffles question order and, within each question, option order — carrying
 * correctIndex to wherever the correct option actually landed.
 */
export function shuffleQuiz<T extends ShuffleableQuestion>(questions: T[], seed: number): T[] {
  const random = seededRandom(seed);
  return shuffle(questions, random).map((question) => {
    // Tag each option with its original index so the correct one can be
    // found again after the shuffle, rather than tracking it by string
    // (two options could legitimately share text).
    const tagged = question.options.map((option, index) => ({ option, index }));
    const shuffled = shuffle(tagged, random);
    return {
      ...question,
      options: shuffled.map((t) => t.option),
      correctIndex: shuffled.findIndex((t) => t.index === question.correctIndex),
    };
  });
}
