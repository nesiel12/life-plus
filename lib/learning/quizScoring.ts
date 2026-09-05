// Quiz scoring for the Learning Hub's chapter quizzes.
//
// Pure, so the scoring rules are testable without an AI call or a rendered
// component — the same split every other derived-value module here uses.

export interface ScorableQuestion {
  correctIndex: number;
}

/** answers[i] is the option index chosen for question i; null = unanswered. */
export type QuizAnswers = (number | null)[];

export interface QuizScore {
  correct: number;
  total: number;
  /** 0-100, rounded. */
  percent: number;
  answered: number;
  allAnswered: boolean;
  /** Hebrew band label for the result. */
  label: string;
}

export function scoreQuiz(questions: ScorableQuestion[], answers: QuizAnswers): QuizScore {
  const total = questions.length;
  let correct = 0;
  let answered = 0;

  for (let i = 0; i < total; i++) {
    const choice = answers[i];
    if (choice === null || choice === undefined) continue;
    answered++;
    if (choice === questions[i].correctIndex) correct++;
  }

  // Guard the divide: a module with no quiz shouldn't produce NaN.
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  return {
    correct,
    total,
    percent,
    answered,
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

/** True once every question has a selection — gates the "submit" affordance. */
export function isComplete(questions: ScorableQuestion[], answers: QuizAnswers): boolean {
  return questions.length > 0 && questions.every((_, i) => answers[i] !== null && answers[i] !== undefined);
}
