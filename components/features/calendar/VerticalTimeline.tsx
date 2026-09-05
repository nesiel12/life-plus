"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Moon, Sparkles, TrendingDown } from "lucide-react";
import { energyForHour, type HourEnergy, type ObservedEnergy } from "@/lib/calendar/energy";
import { cn } from "@/lib/utils";
import type { ChronotypeSettings } from "@/types";

export interface TimelineEvent {
  id: string;
  title: string;
  start: string;
  end: string;
}

interface VerticalTimelineProps {
  /** Any instant within the day being rendered. */
  day: Date;
  events: TimelineEvent[];
  chronotype: ChronotypeSettings;
  /** What the user's check-ins actually show. Overrides the declared
   *  chronotype for hours it has enough evidence about. */
  observedEnergy?: ObservedEnergy;
  /** Draws the "now" marker. Omit for days other than today. */
  now?: Date;
  /** Hours to render, inclusive start, exclusive end. */
  fromHour?: number;
  toHour?: number;
}

const ROW_HEIGHT_REM = 3.5;

// Luxe, not glass: an opaque surface, hairline rules, and gold reserved for
// the single thing that matters most on this screen — the user's peak-focus
// band. Low-energy hours are recessed rather than coloured, so the eye is
// pulled to when they should be working, not when they shouldn't.
const ENERGY_STYLE: Record<HourEnergy, { row: string; rail: string; badge?: string }> = {
  peak: {
    row: "bg-[color-mix(in_srgb,var(--gold)_7%,transparent)]",
    rail: "bg-[var(--gold)]",
    badge: "text-gold-ink",
  },
  low: { row: "bg-fill-subtle/40", rail: "bg-hairline" },
  asleep: { row: "bg-surface-sunken/60", rail: "bg-hairline" },
  neutral: { row: "", rail: "bg-hairline" },
};

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function clockRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)}–${fmt(end)}`;
}

export function VerticalTimeline({
  day,
  events,
  chronotype,
  observedEnergy,
  now,
  fromHour = 6,
  toHour = 24,
}: VerticalTimelineProps) {
  const reduce = useReducedMotion();

  const dayStart = useMemo(() => {
    const d = new Date(day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [day]);

  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );

  // Place each event by its offset from the grid's first hour, in rem, so an
  // event spanning 09:15-10:45 lands exactly across the 09 and 10 rows rather
  // than being snapped to whole hours.
  const positioned = useMemo(() => {
    const gridStartMs = dayStart.getTime() + fromHour * 3_600_000;
    const gridEndMs = dayStart.getTime() + toHour * 3_600_000;
    return events
      .map((event) => {
        const start = new Date(event.start).getTime();
        const end = new Date(event.end).getTime();
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
        if (end <= gridStartMs || start >= gridEndMs) return null;
        const clampedStart = Math.max(start, gridStartMs);
        const clampedEnd = Math.min(end, gridEndMs);
        const topRem = ((clampedStart - gridStartMs) / 3_600_000) * ROW_HEIGHT_REM;
        const heightRem = Math.max(
          ((clampedEnd - clampedStart) / 3_600_000) * ROW_HEIGHT_REM,
          1.5
        );
        return { event, topRem, heightRem };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [events, dayStart, fromHour, toHour]);

  const nowOffsetRem = useMemo(() => {
    if (!now) return null;
    const gridStartMs = dayStart.getTime() + fromHour * 3_600_000;
    const gridEndMs = dayStart.getTime() + toHour * 3_600_000;
    const t = now.getTime();
    if (t < gridStartMs || t > gridEndMs) return null;
    return ((t - gridStartMs) / 3_600_000) * ROW_HEIGHT_REM;
  }, [now, dayStart, fromHour, toHour]);

  return (
    <div className="relative">
      <div className="relative" style={{ height: `${hours.length * ROW_HEIGHT_REM}rem` }}>
        {/* Hour rows: the energy banding lives here, behind the events. */}
        {hours.map((hour, i) => {
          const energy = energyForHour(hour, chronotype, observedEnergy);
          const style = ENERGY_STYLE[energy];
          const isBandStart =
            i === 0 || energyForHour(hours[i - 1], chronotype, observedEnergy) !== energy;
          return (
            <div
              key={hour}
              className={cn(
                "absolute inset-x-0 flex items-start gap-3 border-t border-hairline-card",
                style.row
              )}
              style={{ top: `${i * ROW_HEIGHT_REM}rem`, height: `${ROW_HEIGHT_REM}rem` }}
            >
              <span className="ltr w-12 shrink-0 pt-1 text-start text-xs tabular-nums text-muted">
                {hourLabel(hour)}
              </span>
              <span className={cn("mt-0 h-full w-px shrink-0", style.rail)} aria-hidden />
              {isBandStart && energy !== "neutral" && (
                <span
                  className={cn(
                    "pointer-events-none pt-1 text-[0.65rem] font-medium",
                    style.badge ?? "text-muted"
                  )}
                >
                  {energy === "peak" && (
                    <span className="inline-flex items-center gap-1">
                      <Sparkles size={11} aria-hidden />
                      שעות שיא
                    </span>
                  )}
                  {energy === "low" && (
                    <span className="inline-flex items-center gap-1">
                      <TrendingDown size={11} aria-hidden />
                      אנרגיה נמוכה
                    </span>
                  )}
                  {energy === "asleep" && (
                    <span className="inline-flex items-center gap-1">
                      <Moon size={11} aria-hidden />
                      שינה
                    </span>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Events float above the banding, inset past the hour gutter. */}
        {positioned.map(({ event, topRem, heightRem }, i) => (
          <motion.div
            key={event.id}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
            className="absolute end-0 start-16 overflow-hidden rounded-xl border border-hairline-card bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,16,20,0.04),0_10px_24px_-18px_rgba(16,16,20,0.25)]"
            style={{ top: `${topRem + 0.15}rem`, minHeight: `${heightRem - 0.3}rem` }}
          >
            <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
            <p className="ltr text-xs text-muted">{clockRange(event.start, event.end)}</p>
          </motion.div>
        ))}

        {nowOffsetRem !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-1"
            style={{ top: `${nowOffsetRem}rem` }}
            aria-hidden
          >
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
            <span className="h-px flex-1 bg-[var(--gold)]/50" />
          </div>
        )}
      </div>
    </div>
  );
}
