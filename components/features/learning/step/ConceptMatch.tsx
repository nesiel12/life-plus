"use client";

import { memo, useId, useMemo, useState } from "react";
import { Check, RotateCcw, X } from "lucide-react";
import { buildMatchingRound } from "@/lib/learning/stepBrief";
import type { StepConcept } from "@/types/learning";
import { cn } from "@/lib/utils";

interface ConceptMatchProps {
  concepts: readonly StepConcept[];
  seed: string;
}

/**
 * Concept matching, built from the brief's own concepts — no extra AI call.
 * Each definition gets a native <select> of the terms: fully keyboard- and
 * screen-reader-operable with zero custom drag logic.
 */
export const ConceptMatch = memo(function ConceptMatch({ concepts, seed }: ConceptMatchProps) {
  const baseId = useId();
  const round = useMemo(() => buildMatchingRound(concepts, seed), [concepts, seed]);
  const [picks, setPicks] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);

  if (!round) return null;
  const complete = round.prompts.every((_, i) => picks[i]);
  const score = round.prompts.filter((p, i) => picks[i] === p.term).length;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4">
      <p className="text-xs text-muted">התאם/י כל הגדרה למושג הנכון.</p>
      <ol className="flex flex-col gap-2.5">
        {round.prompts.map((prompt, i) => {
          const pick = picks[i];
          const right = checked && pick === prompt.term;
          const wrong = checked && pick !== prompt.term;
          return (
            <li key={prompt.term} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
              <label htmlFor={`${baseId}-${i}`} className="min-w-0 flex-1 text-sm leading-relaxed text-foreground">
                {prompt.definition}
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  id={`${baseId}-${i}`}
                  value={pick ?? ""}
                  disabled={checked}
                  onChange={(e) => setPicks((p) => ({ ...p, [i]: e.target.value }))}
                  className={cn(
                    "focus-ring min-h-11 min-w-36 rounded-xl border bg-fill-subtle px-2 text-sm text-foreground",
                    right ? "border-accent-health" : wrong ? "border-accent-family" : "border-hairline-card"
                  )}
                >
                  <option value="" disabled>
                    בחר/י מושג…
                  </option>
                  {round.terms.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {right && <Check size={16} className="text-accent-health" aria-label="נכון" />}
                {wrong && <X size={16} className="text-accent-family" aria-label={`לא נכון, התשובה: ${prompt.term}`} />}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        {!checked ? (
          <button
            type="button"
            disabled={!complete}
            onClick={() => setChecked(true)}
            className="focus-ring min-h-11 rounded-xl bg-accent-learning px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
          >
            בדוק התאמות
          </button>
        ) : (
          <>
            <p role="status" className="text-sm font-medium text-foreground">
              {score} מתוך {round.prompts.length} נכונות
            </p>
            <button
              type="button"
              onClick={() => {
                setPicks({});
                setChecked(false);
              }}
              className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-medium text-accent-learning hover:opacity-80"
            >
              <RotateCcw size={12} aria-hidden />
              שוב
            </button>
          </>
        )}
      </div>
    </div>
  );
});
