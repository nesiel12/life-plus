"use client";

import { useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { isComplete, scoreQuiz, type QuizAnswers } from "@/lib/learning/quizScoring";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/ai/courseModule";

interface CourseQuizProps {
  questions: QuizQuestion[];
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
export function CourseQuiz({ questions }: CourseQuizProps) {
  const [answers, setAnswers] = useState<QuizAnswers>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const score = scoreQuiz(questions, answers);
  const ready = isComplete(questions, answers);

  function choose(questionIndex: number, optionIndex: number) {
    if (submitted) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  }

  function reset() {
    setAnswers(questions.map(() => null));
    setSubmitted(false);
  }

  if (questions.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-label="בוחן פרק">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-foreground">בוחן פרק</h3>
        {submitted && (
          <span className="flex items-center gap-2 text-xs">
            <span className="ltr tabular-nums text-gold-ink">
              {score.correct}/{score.total}
            </span>
            <span className="text-muted">{score.label}</span>
          </span>
        )}
      </div>

      <ol className="flex list-none flex-col gap-5">
        {questions.map((question, qi) => {
          const chosen = answers[qi];
          return (
            <li key={`${question.question}-${qi}`} className="flex flex-col gap-2">
              <p className="text-sm text-foreground">
                <span className="ltr me-1.5 text-muted">{qi + 1}.</span>
                {question.question}
              </p>

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
            onClick={() => setSubmitted(true)}
            disabled={!ready}
            className="focus-ring glass-control rounded-lg px-4 py-2 text-xs font-medium text-foreground disabled:opacity-40"
          >
            {ready ? "בדוק תשובות" : `ענה על כל השאלות (${score.answered}/${score.total})`}
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
      </div>
    </section>
  );
}
