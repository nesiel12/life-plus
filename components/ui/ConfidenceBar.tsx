import { cn } from "@/lib/utils";

interface ConfidenceBarProps {
  value: number; // 0..1
  ariaLabel: string;
  barColorClass?: string; // defaults to the majority "bg-accent-faith" convention
  className?: string; // wrapper spacing — callers vary mb-2/mb-3
}

// The one confidence-bar primitive (Atlas Core Optimization v1) —
// previously identical markup (label + thin progressbar + fill) was
// independently written in ScheduleSuggestions, GoalJourneyCard,
// LearningInsightsHero, and PersonRelationshipCard. Every real difference
// between those four call sites (fill color, aria-label text, wrapper
// margin) stays a prop; nothing about the visual result changes.
export function ConfidenceBar({ value, ariaLabel, barColorClass = "bg-accent-faith", className }: ConfidenceBarProps) {
  const percent = Math.round(value * 100);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="shrink-0 text-xs text-muted">רמת התאמה</span>
      <div
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-fill-subtle"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      >
        <div className={cn("h-full rounded-full", barColorClass)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
