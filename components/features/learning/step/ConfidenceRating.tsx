"use client";

import { memo, useRef, type KeyboardEvent } from "react";
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from "@/lib/learning/stepBrief";
import { cn } from "@/lib/utils";

interface ConfidenceRatingProps {
  value: ConfidenceLevel | null;
  onChange: (value: ConfidenceLevel) => void;
  disabled?: boolean;
  /** Visible question, also the radiogroup's accessible name. */
  label?: string;
}

/**
 * "How sure are you?" — asked *before* an answer is revealed, so the learner
 * commits to a judgement of their own knowledge first (metacognition). A
 * proper radiogroup: one tab stop, arrow keys move between levels.
 */
export const ConfidenceRating = memo(function ConfidenceRating({ value, onChange, disabled, label = "כמה את/ה בטוח/ה בתשובה?" }: ConfidenceRatingProps) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    CONFIDENCE_LEVELS.findIndex((l) => l.value === value)
  );

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // RTL: the visual "next" is to the left.
    const step = e.key === "ArrowLeft" || e.key === "ArrowDown" ? 1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (activeIndex + step + CONFIDENCE_LEVELS.length) % CONFIDENCE_LEVELS.length;
    onChange(CONFIDENCE_LEVELS[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span id={undefined} className="text-xs font-medium text-muted">
        {label}
      </span>
      <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5">
        {CONFIDENCE_LEVELS.map((level, i) => {
          const checked = value === level.value;
          return (
            <button
              key={level.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === activeIndex ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(level.value)}
              className={cn(
                "focus-ring min-h-11 rounded-full px-3.5 text-xs font-medium transition-colors disabled:opacity-60",
                checked ? "bg-accent-learning text-background" : "bg-fill-subtle text-foreground hover:bg-accent-learning/15"
              )}
            >
              {level.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
