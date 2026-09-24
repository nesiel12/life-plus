"use client";

import { memo, useState } from "react";
import { Check, Clock, ListTodo, Loader2, Rocket } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import type { StepPracticeTask } from "@/types/learning";

/**
 * "Put it into practice" — the step's one real-world exercise. It can become
 * a real task in the Task Engine (the same addTask every other surface uses),
 * so the transfer step leaves the learning page and lands in the person's day.
 */
export const PracticeCard = memo(function PracticeCard({ practice, topicTitle }: { practice: StepPracticeTask; topicTitle: string }) {
  const addTask = useAtlasStore((s) => s.addTask);
  const [state, setState] = useState<"idle" | "busy" | "added" | "error">("idle");

  async function toTask() {
    setState("busy");
    try {
      await addTask({ title: `${topicTitle}: ${practice.title}`, description: practice.instructions });
      setState("added");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-accent-learning/30 bg-accent-learning/[0.06] p-4">
      <div className="flex items-start gap-2.5">
        <Rocket size={17} className="mt-0.5 shrink-0 text-accent-learning" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{practice.title}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90">{practice.instructions}</p>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-muted">
            <Clock size={11} aria-hidden />
            כ-{practice.estimatedMinutes} דקות
          </p>
        </div>
      </div>
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        {state === "added" ? (
          <span className="flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent-health">
            <Check size={14} aria-hidden />
            נוסף למשימות שלך
          </span>
        ) : (
          <button
            type="button"
            onClick={() => void toTask()}
            disabled={state === "busy"}
            className="focus-ring flex min-h-11 items-center gap-1.5 rounded-xl bg-accent-learning px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-50"
          >
            {state === "busy" ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ListTodo size={14} aria-hidden />}
            הוסף למשימות שלי
          </button>
        )}
        {state === "error" && <span className="text-xs text-accent-family">לא הצלחנו להוסיף את המשימה.</span>}
      </div>
    </div>
  );
});
