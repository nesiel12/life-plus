"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, ChevronDown, Loader2, Send, XCircle } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import { HavrutaHint } from "@/components/features/torah/practice/HavrutaHint";
import { QUESTION_KINDS } from "@/components/features/torah/practice/questionKinds";
import type { PracticeAttemptView, PracticeQuestionView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

interface QuestionRoundProps {
  question: PracticeQuestionView & { lessonTitle?: string | null };
  /** Called once the answer is graded (or saved without a grade). */
  onGraded: (score: number | null) => void;
  onContinue: () => void;
}

function scoreColor(score: number): string {
  return score >= 70 ? "var(--accent-health)" : score >= 40 ? "var(--gold)" : "var(--accent-family)";
}

/**
 * A written round: the question, a floating Havruta hint, and — on submit —
 * instant AI grading against the question's rubric, criterion by criterion,
 * with the reasoned answer revealed only after trying.
 */
export function QuestionRound({ question, onGraded, onContinue }: QuestionRoundProps) {
  const reduceMotion = useReducedMotion();
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState<PracticeAttemptView | null>(null);
  const [modelAnswer, setModelAnswer] = useState<string | null>(null);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [showModel, setShowModel] = useState(false);
  const kind = QUESTION_KINDS[question.kind];
  const KindIcon = kind.icon;

  async function submit() {
    if (answer.trim().length < 3 || submitting) return;
    setSubmitting(true);
    setGradingError(null);
    try {
      const response = await fetch("/api/torah/practice/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer: answer.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setGradingError(typeof data.error === "string" ? data.error : "השליחה נכשלה.");
        return;
      }
      setAttempt(data.attempt);
      setModelAnswer(data.question?.modelAnswer ?? null);
      if (data.gradingError) setGradingError(data.gradingError);
      onGraded(typeof data.attempt?.score === "number" ? data.attempt.score : null);
    } catch {
      setGradingError("השליחה נכשלה. בדוק את החיבור.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-hairline-card bg-surface p-5 shadow-[0_28px_60px_-40px_rgba(16,16,20,0.5)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", kind.tone)}>
          <KindIcon size={13} aria-hidden />
          {kind.label}
        </span>
        <span className="flex items-center gap-1" aria-label={`קושי ${question.difficulty} מתוך 5`}>
          {[1, 2, 3, 4, 5].map((level) => (
            <span key={level} className={cn("size-1.5 rounded-full", level <= question.difficulty ? "bg-gold" : "bg-fill")} aria-hidden />
          ))}
        </span>
      </div>
      {question.lessonTitle && <p className="-mt-2 text-[0.7rem] text-muted">מתוך: {question.lessonTitle}</p>}

      <p className="text-lg font-medium leading-relaxed text-foreground">{question.prompt}</p>

      {!attempt ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={5}
            maxLength={5000}
            placeholder={question.kind === "dilemma" ? "הכרע ונמק — ומה היה אומר הצד השני?" : question.kind === "counter" ? "איך מתרצים?" : "התשובה שלך…"}
            aria-label="התשובה שלך"
            className="w-full resize-y rounded-2xl border border-hairline-card bg-background/60 p-3.5 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted focus:border-gold-line"
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <HavrutaHint questionId={question.id} draft={answer} />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={answer.trim().length < 3 || submitting}
              className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Send size={14} className="-scale-x-100" aria-hidden />}
              {submitting ? "החברותא בודקת…" : "שלח לבדיקה"}
            </button>
          </div>
          {gradingError && <p className="text-xs text-accent-family">{gradingError}</p>}
        </>
      ) : (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-start gap-4">
            {typeof attempt.score === "number" && (
              <ProgressRing value={attempt.score / 100} size={76} stroke={7} color={scoreColor(attempt.score)} label={`ציון ${attempt.score}`}>
                <span className="ltr text-lg font-bold tabular-nums text-foreground">{attempt.score}</span>
              </ProgressRing>
            )}
            <div className="min-w-0 flex-1">
              {attempt.feedback && <p className="text-sm leading-relaxed text-foreground/90">{attempt.feedback}</p>}
              {gradingError && <p className="text-xs text-muted">{gradingError}</p>}
            </div>
          </div>

          {attempt.rubricResults.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {attempt.rubricResults.map((result, i) => (
                <motion.li
                  key={i}
                  initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.1 + i * 0.08 }}
                  className="flex items-start gap-2 rounded-xl bg-surface-sunken/60 px-3 py-2"
                >
                  {result.met ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent-health" aria-label="התקיים" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-accent-family" aria-label="חסר" />
                  )}
                  <span className="text-xs leading-relaxed text-foreground/85">
                    <span className="font-medium text-foreground">{result.criterion}</span>
                    {result.note && <span className="text-muted"> — {result.note}</span>}
                  </span>
                </motion.li>
              ))}
            </ul>
          )}

          {modelAnswer && (
            <div className="rounded-2xl border border-gold-line bg-gold-soft/40">
              <button
                type="button"
                onClick={() => setShowModel((v) => !v)}
                aria-expanded={showModel}
                className="focus-ring flex w-full items-center justify-between px-4 py-2.5 text-xs font-medium text-gold-ink"
              >
                התשובה המנומקת
                <ChevronDown size={14} className={cn("transition-transform", showModel && "rotate-180")} aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {showModel && (
                  <motion.p
                    initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                    className="overflow-hidden px-4 pb-3 text-sm leading-relaxed text-foreground/85"
                  >
                    {modelAnswer}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          )}

          <button
            type="button"
            onClick={onContinue}
            autoFocus
            className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
          >
            המשך
          </button>
        </motion.div>
      )}
    </div>
  );
}
