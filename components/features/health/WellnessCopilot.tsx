"use client";

import { useMemo, useState } from "react";
import { Apple, Brain, CalendarPlus, Check, Droplets, Dumbbell, Loader2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { buildWellnessSuggestions, type WellnessKind, type WellnessSuggestion } from "@/lib/health/wellnessCopilot";
import { cn } from "@/lib/utils";

const ICON: Record<WellnessKind, typeof Dumbbell> = {
  workout: Dumbbell,
  nutrition: Apple,
  hydration: Droplets,
  mindset: Brain,
};

const ACCENT: Record<WellnessKind, string> = {
  workout: "text-accent-fitness",
  nutrition: "text-accent-health",
  hydration: "text-accent-knowledge",
  mindset: "text-gold-ink",
};

// The Wellness Copilot.
//
// Every suggestion comes from lib/health/wellnessCopilot.ts, which is pure
// and tested — the component only renders and handles the one action a
// suggestion can carry. No AI call: these render with the page, and the
// decisions behind them ("no workout logged today", "it's 3pm") are facts
// already on the client.
export function WellnessCopilot() {
  const meals = useAtlasStore((s) => s.meals);
  const workouts = useAtlasStore((s) => s.workouts);
  const addManualEvent = useAtlasStore((s) => s.addManualEvent);

  const [scheduling, setScheduling] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const suggestions = useMemo(
    () => buildWellnessSuggestions({ meals, workouts, now: new Date() }).filter((s) => !dismissed.has(s.id)),
    [meals, workouts, dismissed]
  );

  async function schedule(suggestion: WellnessSuggestion) {
    if (!suggestion.scheduleMinutes) return;
    setScheduling(suggestion.id);
    setError(null);
    try {
      // "In an hour" for a deferred suggestion, "now" for an immediate one —
      // matching what the copy on the card actually promised.
      const start = new Date();
      if (suggestion.title.includes("בהמשך")) start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + suggestion.scheduleMinutes * 60_000);

      await addManualEvent({
        title: suggestion.title,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        category: "health",
      });
      setScheduled((prev) => new Set(prev).add(suggestion.id));
    } catch {
      setError("לא הצלחנו לקבוע את הזמן. נסה שוב.");
    } finally {
      setScheduling(null);
    }
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Brain size={15} className="text-accent-health" aria-hidden />
        עוזר הבריאות
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {suggestions.map((suggestion) => {
          const Icon = ICON[suggestion.kind];
          const done = scheduled.has(suggestion.id);
          return (
            <div
              key={suggestion.id}
              className="flex min-w-0 flex-col gap-2 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Icon size={15} className={cn("shrink-0", ACCENT[suggestion.kind])} aria-hidden />
                {suggestion.title}
              </p>
              <p className="text-xs leading-relaxed text-foreground/75">{suggestion.detail}</p>

              <div className="flex items-center gap-2">
                {suggestion.scheduleMinutes && (
                  <button
                    onClick={() => schedule(suggestion)}
                    disabled={scheduling !== null || done}
                    className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground disabled:opacity-60"
                  >
                    {scheduling === suggestion.id ? (
                      <Loader2 size={12} className="animate-spin" aria-hidden />
                    ) : done ? (
                      <Check size={12} className="text-accent-health" aria-hidden />
                    ) : (
                      <CalendarPlus size={12} aria-hidden />
                    )}
                    {done ? "נקבע" : `קבע ${suggestion.scheduleMinutes} דק׳`}
                  </button>
                )}
                {/* Dismissal is per-session, not persisted: these are
                    time-of-day prompts that should come back tomorrow, and
                    storing a permanent "never show" for a hydration nudge
                    would quietly disable the feature. */}
                <button
                  onClick={() => setDismissed((prev) => new Set(prev).add(suggestion.id))}
                  className="focus-ring rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  לא עכשיו
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}
