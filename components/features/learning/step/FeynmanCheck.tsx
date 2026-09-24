"use client";

import { memo, useId, useState } from "react";
import { AlertCircle, Loader2, MessageSquareText } from "lucide-react";
import { gradeFeynmanExplanation } from "@/lib/learning/labClient";
import { CLARITY_BAND_LABELS, clarityBand } from "@/lib/learning/feynman";
import type { FeynmanEvaluation } from "@/lib/ai/agents/learningLabAgent";
import { cn } from "@/lib/utils";

interface FeynmanCheckProps {
  topicTitle: string;
  concept: string;
}

const BAND_TONE = {
  unclear: "text-accent-family",
  partial: "text-accent-fitness",
  clear: "text-accent-learning",
  excellent: "text-accent-health",
} as const;

/**
 * "Explain it in your own words" at the end of the step — the same grader as
 * the Feynman lab tab (app/api/ai/learning-lab, mode "feynmanGrade"), pointed
 * at the one concept the brief picked as this step's core.
 */
export const FeynmanCheck = memo(function FeynmanCheck({ topicTitle, concept }: FeynmanCheckProps) {
  const textId = useId();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<FeynmanEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function grade() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setEvaluation(await gradeFeynmanExplanation(topicTitle, concept, text.trim()));
    } catch {
      setError("לא הצלחנו לבדוק את ההסבר כרגע. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-gradient-to-bl from-accent-learning/[0.07] to-surface p-4">
      <label htmlFor={textId} className="text-sm font-medium text-foreground">
        הסבר/י את <span className="font-semibold text-accent-learning">&quot;{concept}&quot;</span> במילים שלך, כאילו את/ה מלמד/ת חבר שלא שמע על זה אף פעם.
      </label>
      <textarea
        id={textId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={4000}
        placeholder="ההסבר שלך…"
        className="focus-ring resize-y rounded-xl bg-surface p-3 text-sm text-foreground placeholder:text-muted"
      />
      <button
        type="button"
        onClick={() => void grade()}
        disabled={!text.trim() || busy}
        aria-busy={busy}
        className="focus-ring flex min-h-11 w-fit items-center gap-1.5 rounded-xl bg-accent-learning px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <MessageSquareText size={14} aria-hidden />}
        בדוק את ההבנה שלי
      </button>

      <div aria-live="polite">
        {error && <p className="text-xs text-accent-family">{error}</p>}
        {evaluation && (
          <div className="flex flex-col gap-2 rounded-xl bg-surface p-3">
            <p className="flex items-baseline gap-2">
              <span className={cn("text-xl font-bold tabular-nums", BAND_TONE[clarityBand(evaluation.clarityScore)])}>{evaluation.clarityScore}</span>
              <span className="text-sm font-medium text-foreground">{CLARITY_BAND_LABELS[clarityBand(evaluation.clarityScore)]}</span>
            </p>
            <p className="text-sm leading-relaxed text-foreground/90">{evaluation.feedback}</p>
            {evaluation.gaps.length > 0 && (
              <div>
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <AlertCircle size={12} aria-hidden />
                  פערים ותפיסות שגויות להשלים
                </p>
                <ul className="mt-1 flex list-disc flex-col gap-1 ps-5 text-xs leading-relaxed text-foreground/85">
                  {evaluation.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
