"use client";

import { useMemo, useState } from "react";
import { Check, Flag, RotateCcw, SkipForward, X } from "lucide-react";
import {
  isSubmittable,
  scoreQuiz,
  shuffleQuiz,
  type QuizAnswers,
  type QuizFlags,
} from "@/lib/learning/quizScoring";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/ai/courseModule";

interface CourseQuizProps {
  questions: QuizQuestion[];
  /** Fired once the quiz is submitted, for auto-progression. */
  onComplete?: (percent: number) => void;
  /** Offers a way past the quiz without taking it. */
  onSkip?: () => void;
}

// Chapter quiz with instant scoring.
//
// Selection is optimistic in the truest sense — it's local state, so a click
// registers on the same frame with no request at all. Nothing here needs the
// server: the correct answer ships with the module, so grading is immediate
// and works offline.
//
// Answers stay visible and locked after submitting rather than resetting:
// the point of the quiz is learning what you got wrong, and clearing the
// selections would take that away at exactly the moment it becomes useful.
export function CourseQuiz({ questions, onComplete, onSkip }: CourseQuizProps) {
  // A per-attempt seed. Randomising question and option order stops the quiz
  // being learnable by position, and seeding it keeps the order stable across
  // re-renders — reshuffling on every state change would move an option out
  // from under the user's cursor mid-click. Bumping the seed is what makes
  // "try again" a genuinely different attempt.
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const shuffled = useMemo(() => shuffleQuiz(questions, seed), [questions, seed]);

  const [answers, setAnswers] = useState<QuizAnswers>(() => questions.map(() => null));
  // Questions deliberately set aside. Without this, one question the learner
  // cannot answer blocked the whole quiz — submit was gated on every answer
  // being filled in, so the course had a dead end in it.
  const [flagged, setFlagged] = useState<QuizFlags>(() => questions.map(() => false));
  const [submitted, setSubmitted] = useState(false);

  const score = scoreQuiz(shuffled, answers, flagged);
  const ready = isSubmittable(shuffled, answers, flagged);

  function submit() {
    setSubmitted(true);
    // Auto-completion: the caller advances on this rather than making the
    // user press a second "mark as done" button.
    onComplete?.(scoreQuiz(shuffled, answers, flagged).percent);
  }

  function toggleFlag(questionIndex: number) {
    if (submitted) return;
    setFlagged((prev) => {
      const next = [...prev];
      next[questionIndex] = !next[questionIndex];
      return next;
    });
  }

  function choose(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
    // Answering resolves the flag. Leaving it raised would keep counting an
    // answered question as set aside in the summary.
    setFlagged((prev) => {
      if (!prev[questionIndex]) return prev;
      const next = [...prev];
      next[questionIndex] = false;
      return next;
    });
  }

  function reset() {
    setAnswers(questions.map(() => null));
    setFlagged(questions.map(() => false));
    setSubmitted(false);
    // A fresh order for the retry, so a second attempt isn't just recall of
    // where the right option sat last time.
    setSeed(Math.floor(Math.random() * 1_000_000));
  }

  if (questions.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-label="בוחן פרק">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">בוחן פרק</h3>
        {submitted && (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <span className="ltr tabular-nums text-gold-ink">
              {score.correct}/{score.total}
            </span>
            <span className="text-muted">{score.label}</span>
            {/* Said plainly, so a high "of what you answered" figure can
                never be mistaken for a high overall one. */}
            {score.skipped > 0 && (
              <span className="ltr rounded-full bg-fill-subtle px-2 py-0.5 tabular-nums text-muted">
                {score.skipped} דילגת · {score.attemptedPercent}% מהנענו
              </span>
            )}
          </span>
        )}
      </div>

      <ol className="flex list-none flex-col gap-5">
        {shuffled.map((question, qi) => {
          const chosen = answers[qi];
          const isFlagged = Boolean(flagged[qi]);
          return (
            <li key={`${question.question}-${qi}`} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-foreground">
                  <span className="ltr me-1.5 text-muted">{qi + 1}.</span>
                  {question.question}
                </p>
                {!submitted && (
                  <button
                    type="button"
                    onClick={() => toggleFlag(qi)}
                    aria-pressed={isFlagged}
                    aria-label={isFlagged ? `בטל דגל על שאלה ${qi + 1}` : `דגל את שאלה ${qi + 1}`}
                    className={cn(
                      "focus-ring flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[0.7rem] transition-colors",
                      isFlagged
                        ? "bg-gold-soft text-gold-ink"
                        : "text-muted hover:bg-fill-subtle hover:text-foreground"
                    )}
                  >
                    <Flag size={11} aria-hidden />
                    דגל
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={question.question}>
                {question.options.map((option, oi) => {
                  const isChosen = chosen === oi;
                  const isCorrect = oi === question.correctIndex;
                  // Only reveal correctness after submitting — colouring the
                  // right answer while choosing would give it away.
                  const revealed = submitted;
                  return (
                    <button
                      key={`${option}-${oi}`}
                      type="button"
                      role="radio"
                      aria-checked={isChosen}
                      disabled={submitted}
                      onClick={() => choose(qi, oi)}
                      className={cn(
                        "focus-ring flex items-center gap-2.5 rounded-lg border px-3 py-2 text-start text-sm transition-colors",
                        revealed && isCorrect && "border-accent-health/50 bg-accent-health/10 text-accent-health",
                        revealed && isChosen && !isCorrect && "border-accent-family/50 bg-accent-family/10 text-accent-family",
                        revealed && !isCorrect && !isChosen && "border-hairline-card text-muted",
                        !revealed && isChosen && "border-gold-line bg-gold-soft text-gold-ink",
                        !revealed && !isChosen && "border-hairline-card text-foreground hover:bg-fill-subtle"
                      )}
                    >
                      {revealed && isCorrect && <Check size={13} className="shrink-0" aria-hidden />}
                      {revealed && isChosen && !isCorrect && <X size={13} className="shrink-0" aria-hidden />}
                      <span className="min-w-0 flex-1">{option}</span>
                    </button>
                  );
                })}
              </div>

              {submitted && (
                <p className="rounded-lg bg-fill-subtle px-3 py-2 text-xs leading-relaxed text-foreground/80">
                  {question.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex items-center gap-2">
        {!submitted ? (
          <button
            onClick={submit}
            disabled={!ready}
            className="focus-ring glass-control rounded-lg px-4 py-2 text-xs font-medium text-foreground disabled:opacity-40"
          >
            {ready ? "בדוק תשובות" : `ענה או דגל את כל השאלות (${score.answered + score.skipped}/${score.total})`}
          </button>
        ) : (
          <button
            onClick={reset}
            className="focus-ring glass-control flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-foreground"
          >
            <RotateCcw size={13} aria-hidden />
            נסה שוב
          </button>
        )}

        {/* Leaving the quiz entirely. Distinct from flagging a question:
            this abandons the attempt rather than setting one item aside,
            and it exists so a quiz can never be the thing that ends
            someone's progress through a course. */}
        {onSkip && (
          <button
            onClick={onSkip}
            className="focus-ring ms-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:text-foreground"
          >
            המשך בלי הבוחן
            <SkipForward size={12} aria-hidden />
          </button>
        )}
      </div>
    </section>
  );
}
