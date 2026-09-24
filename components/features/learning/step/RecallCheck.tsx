"use client";

import { memo, useEffect, useId, useRef, useState } from "react";
import { Check, Lightbulb, RotateCcw, X } from "lucide-react";
import { ConfidenceRating } from "@/components/features/learning/step/ConfidenceRating";
import { CALIBRATION_MESSAGE, calibrationFor, isRecallCorrect, splitRecallSentence, type ConfidenceLevel } from "@/lib/learning/stepBrief";
import type { StepRecallItem } from "@/types/learning";
import { cn } from "@/lib/utils";

interface RecallCheckProps {
  item: StepRecallItem;
  index: number;
  onResult?: (correct: boolean) => void;
}

/**
 * An inline fill-in-the-blank — retrieval practice right inside the text.
 * The flow is: type the missing word → say how sure you are → check. The
 * answer is never shown before the learner has committed to both.
 */
export const RecallCheck = memo(function RecallCheck({ item, index, onResult }: RecallCheckProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceLevel | null>(null);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [showHint, setShowHint] = useState(false);
  // The check button unmounts on submit; hand focus to the result rather
  // than letting it fall to <body>.
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (checked !== null) resultRef.current?.focus();
  }, [checked]);
  const [before, after] = splitRecallSentence(item.sentence);

  function check() {
    if (!value.trim() || confidence === null) return;
    const correct = isRecallCorrect(item, value);
    setChecked(correct);
    onResult?.(correct);
  }

  function reset() {
    setValue("");
    setConfidence(null);
    setChecked(null);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        check();
      }}
      className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4"
    >
      <p className="text-sm leading-loose text-foreground">
        <span className="me-1.5 text-xs font-semibold text-muted">{index + 1}.</span>
        {before}
        <label htmlFor={inputId} className="sr-only">
          השלמה למשפט {index + 1}
        </label>
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={checked !== null}
          autoComplete="off"
          aria-invalid={checked === false}
          className={cn(
            "focus-ring mx-1 inline-block min-h-11 w-36 rounded-lg border-b-2 bg-fill-subtle px-2 text-center text-sm font-medium text-foreground align-middle",
            checked === null && "border-accent-learning/50",
            checked === true && "border-accent-health bg-accent-health/10",
            checked === false && "border-accent-family bg-accent-family/10"
          )}
        />
        {after}
      </p>

      {checked === null && (
        <>
          <ConfidenceRating value={confidence} onChange={setConfidence} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!value.trim() || confidence === null}
              className="focus-ring min-h-11 rounded-xl bg-accent-learning px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
            >
              בדוק
            </button>
            {item.hint && !showHint && (
              <button type="button" onClick={() => setShowHint(true)} className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-muted hover:text-foreground">
                <Lightbulb size={13} aria-hidden />
                רמז
              </button>
            )}
            {!value.trim() || confidence === null ? <span className="text-[11px] text-muted">כתוב/י תשובה ודרג/י ביטחון כדי לבדוק</span> : null}
          </div>
          {showHint && <p className="text-xs text-muted">רמז: {item.hint}</p>}
        </>
      )}

      {checked !== null && confidence !== null && (
        <div ref={resultRef} tabIndex={-1} role="status" className="flex flex-col gap-2 outline-none">
          <p className={cn("flex items-center gap-1.5 text-sm font-semibold", checked ? "text-accent-health" : "text-accent-family")}>
            {checked ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
            {checked ? "נכון!" : `התשובה: ${item.answer}`}
          </p>
          <p className="text-xs leading-relaxed text-foreground/85">{CALIBRATION_MESSAGE[calibrationFor(confidence, checked)]}</p>
          <button type="button" onClick={reset} className="focus-ring flex min-h-11 w-fit items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-accent-learning hover:opacity-80">
            <RotateCcw size={12} aria-hidden />
            נסה שוב
          </button>
        </div>
      )}
    </form>
  );
});
