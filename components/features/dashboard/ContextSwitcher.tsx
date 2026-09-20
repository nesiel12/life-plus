"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Briefcase, Compass, Moon, Sunrise, Sunset, type LucideIcon } from "lucide-react";
import type { ContextCardId, ContextWindow, ResolvedContext } from "@/lib/dashboard/context";
import { EnergyCard, TopThreeCard, TorahCard, WaterCard } from "@/components/features/dashboard/context/MorningCards";
import { FocusCard, PriorityTasksCard } from "@/components/features/dashboard/context/WorkCards";
import {
  FamilyCard,
  GratitudeCard,
  HabitsCard,
  ReflectionCard,
} from "@/components/features/dashboard/context/EveningCards";
import { SleepCard, TomorrowCard } from "@/components/features/dashboard/context/NightCards";
import { cn } from "@/lib/utils";

const WINDOW_ICON: Record<ContextWindow, LucideIcon> = {
  morning: Sunrise,
  work: Briefcase,
  evening: Sunset,
  night: Moon,
};

const WINDOW_LABEL: Record<ContextWindow, string> = {
  morning: "בוקר",
  work: "שעות עבודה",
  evening: "ערב",
  night: "לילה",
};

// Static, because Tailwind only emits classes it can see whole. The band never
// holds more than four cards; fewer make each one wider rather than leaving a gap.
const GRID_COLS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

function renderCard(id: ContextCardId, context: ResolvedContext, now: Date): ReactNode {
  switch (id) {
    case "energy":
      return <EnergyCard energy={context.energy} />;
    case "torah":
      return <TorahCard />;
    case "water":
      return <WaterCard />;
    case "fuel":
      return <WaterCard withMeal />;
    case "top-three":
      return <TopThreeCard />;
    case "priority-tasks":
      return <PriorityTasksCard energy={context.energy} now={now} />;
    case "focus":
      return <FocusCard energy={context.energy} now={now} />;
    case "family":
      return <FamilyCard now={now} />;
    case "reflection":
      return <ReflectionCard />;
    case "gratitude":
      return <GratitudeCard />;
    case "habits":
      return <HabitsCard now={now} />;
    case "sleep":
      return <SleepCard now={now} />;
    case "tomorrow":
      return <TomorrowCard now={now} />;
  }
}

interface ContextSwitcherProps {
  context: ResolvedContext;
  now: Date;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

/**
 * "עכשיו בשבילך" — the day's current context, above the user's own grid.
 *
 * The band shows the compact cards that suit this window (which have no place
 * in the arranged grid), and the grid below floats a few matching widgets up
 * (lib/dashboard/context.ts contextualWidgets) — without ever rewriting the
 * saved arrangement. One switch turns the whole feature off, and this same
 * component becomes the chip that turns it back on.
 */
export function ContextSwitcher({ context, now, enabled, onToggle }: ContextSwitcherProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const Icon = WINDOW_ICON[context.window];

  if (!enabled) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => onToggle(true)}
          className="focus-ring glass-control-hover flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Compass size={13} aria-hidden />
          הפעל התאמה להקשר
        </button>
      </div>
    );
  }

  const transition = context.transition;

  return (
    <section
      aria-label={`עכשיו בשבילך — ${context.label}`}
      data-context-window={context.window}
      data-context-transition={transition ? `${transition.from}>${transition.to}` : undefined}
      className="mb-6 rounded-3xl border border-hairline-card bg-surface-sunken/50 p-4 sm:p-5"
    >
      <header className="mb-3.5 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Icon size={18} className="text-gold-ink" aria-hidden />
            <span>עכשיו · </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={context.label}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
              >
                {context.label}
              </motion.span>
            </AnimatePresence>
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted">{context.tagline}</p>
          {transition && (
            <p className="mt-1 text-[0.7rem] text-muted" data-testid="context-handover">
              בדרך מ{WINDOW_LABEL[transition.from]} אל {WINDOW_LABEL[transition.to]}
            </p>
          )}
        </div>
        <button
          onClick={() => onToggle(false)}
          aria-pressed
          className="focus-ring glass-control-hover flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Compass size={13} aria-hidden />
          התאמה להקשר: פעילה
        </button>
      </header>

      <div
        className={cn(
          // items-start: cards keep their own height. Stretching them to the tallest in the
          // row (the Family card, with its drafts) left the short ones mostly blank.
          "grid grid-cols-1 items-start gap-3 sm:grid-cols-2",
          GRID_COLS[Math.min(4, Math.max(1, context.cards.length))],
          // An odd card count in the two-column layout would leave the last card
          // beside an empty cell; let it take the full row instead. At lg the
          // column count already matches the card count, so it goes back to one.
          "sm:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1"
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {context.cards.map((id) => (
            <motion.div
              key={id}
              layout={!reduceMotion}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="min-w-0"
              data-context-card={id}
            >
              {renderCard(id, context, now)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
