"use client";

import { useState, type MouseEvent } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, PartyPopper } from "lucide-react";
import { useResourceCompletion } from "@/components/features/learning/lab/useResourceCompletion";
import { originOf } from "@/components/features/learning/lab/LabContext";
import { xpForResource } from "@/lib/learning/xp";
import { cn } from "@/lib/utils";
import type { LearningResource } from "@/types";

interface ClassroomNavBarProps {
  resource: LearningResource;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

// How long the celebration (confetti/+XP/chime, all fired by
// useResourceCompletion — unchanged from the syllabus checkbox's own
// celebration) gets to play before the content underneath swaps to the
// next step. Long enough that a completion doesn't feel cut off by an
// abrupt swap, short enough that "מסמן כהושלם" doesn't feel unresponsive.
const AUTO_ADVANCE_DELAY_MS = 700;

/**
 * The classroom's fixed footer — completion moved here from LessonViewport's
 * own in-content button, so it's the one place a step gets marked done
 * regardless of which of the four zones the person is looking at, and the
 * one place Previous/Next live.
 */
export function ClassroomNavBar({ resource, hasPrev, hasNext, onPrev, onNext }: ClassroomNavBarProps) {
  const complete = useResourceCompletion();
  const [completing, setCompleting] = useState(false);

  async function markComplete(e: MouseEvent<HTMLButtonElement>) {
    setCompleting(true);
    try {
      await complete(resource, true, originOf(e.currentTarget));
      if (hasNext) setTimeout(onNext, AUTO_ADVANCE_DELAY_MS);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div dir="rtl" className="flex items-center gap-2 border-t border-hairline-card bg-surface px-4 py-3 sm:px-6">
      <button
        onClick={onPrev}
        disabled={!hasPrev}
        className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-opacity hover:bg-fill-subtle disabled:opacity-30"
      >
        <ChevronRight size={16} aria-hidden />
        הקודם
      </button>

      <div className="flex-1" />

      {resource.isCompleted ? (
        <span className="flex items-center gap-1.5 text-sm font-medium text-accent-learning">
          <CheckCircle2 size={16} aria-hidden />
          הושלם
        </span>
      ) : (
        <button
          onClick={(e) => void markComplete(e)}
          disabled={completing}
          className={cn(
            "focus-ring flex items-center gap-2 rounded-2xl bg-accent-learning px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90",
            completing && "opacity-60"
          )}
        >
          <PartyPopper size={16} aria-hidden />
          סמן כהושלם{` +${xpForResource(resource.type)} XP`}
        </button>
      )}

      <div className="flex-1" />

      <button
        onClick={onNext}
        disabled={!hasNext}
        className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-foreground transition-opacity hover:bg-fill-subtle disabled:opacity-30"
      >
        הבא
        <ChevronLeft size={16} aria-hidden />
      </button>
    </div>
  );
}
