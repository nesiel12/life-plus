"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, Check, Loader2, Moon, Sparkles, TrendingDown } from "lucide-react";
import { energyForHour, type HourEnergy, type ObservedEnergy } from "@/lib/calendar/energy";
import { DeleteEventButton, type DeletableEvent } from "@/components/features/calendar/DeleteEventDialog";
import { cn } from "@/lib/utils";
import type { ChronotypeSettings } from "@/types";

export interface TimelineEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  /** Which Google calendar it belongs to — needed to delete it. */
  calendarId?: string;
  canEdit?: boolean;
}

/** A free stretch between events, resolved to something worth showing. */
export interface TimelineGap {
  id: string;
  /** Minutes since local midnight. */
  startMinute: number;
  endMinute: number;
  durationMinutes: number;
  label: string;
  accentVar?: string;
  /** A pressing task that fits here, offered with a "schedule it" button. */
  task?: { id: string; title: string } | null;
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
  /** Opt-in: renders a delete affordance on each event. Omitted where the
   *  timeline is a read-only summary (the dashboard card). */
  onDeleteEvent?: (event: DeletableEvent) => void;
  /** Free-time bands drawn behind the events. */
  gaps?: TimelineGap[];
  /** Schedules a gap's suggested task as a real calendar event. Resolves
   *  when the write lands; the timeline refetches from the parent. */
  onScheduleGapTask?: (input: {
    taskId: string;
    title: string;
    startMinute: number;
    endMinute: number;
  }) => Promise<void>;
}

// Tighter than it was (3.5rem): an 18-hour column at the old height was a
// screenful of mostly-empty rows before the first event. The grid also
// starts at 07:00 now, and DayView widens it only for events that fall
// outside — so a normal day is compact and an early flight still shows.
const ROW_HEIGHT_REM = 2.75;

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

function minuteLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatGapDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} דק׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) return hours === 1 ? "שעה" : `${hours} שע׳`;
  return `${hours}:${String(rest).padStart(2, "0")} שע׳`;
}

function clockRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)}–${fmt(end)}`;
}

function GapBand({
  gap,
  topRem,
  heightRem,
  onSchedule,
}: {
  gap: TimelineGap;
  topRem: number;
  heightRem: number;
  onSchedule?: VerticalTimelineProps["onScheduleGapTask"];
}) {
  const [state, setState] = useState<"idle" | "scheduling" | "done">("idle");
  const accent = gap.accentVar ?? "--muted";
  const roomy = heightRem >= 3;

  function schedule() {
    if (!gap.task || !onSchedule || state !== "idle") return;
    setState("scheduling");
    // Put it early in the gap, capped at 60 minutes.
    const start = gap.startMinute;
    const end = Math.min(gap.endMinute, start + 60);
    onSchedule({ taskId: gap.task.id, title: gap.task.title, startMinute: start, endMinute: end })
      .then(() => setState("done"))
      .catch(() => setState("idle"));
  }

  return (
    <div
      className="absolute end-0 start-16 flex flex-col justify-center overflow-hidden rounded-xl border border-dashed px-3 py-1.5"
      style={{
        top: `${topRem + 0.15}rem`,
        height: `${Math.max(heightRem - 0.3, 1.1)}rem`,
        borderColor: `color-mix(in srgb, var(${accent}) 30%, transparent)`,
        background: `color-mix(in srgb, var(${accent}) 5%, transparent)`,
      }}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span
            className="truncate text-xs font-medium"
            style={{ color: `color-mix(in srgb, var(${accent}) 85%, var(--foreground))` }}
          >
            {gap.label}
          </span>
          <span className="ltr shrink-0 text-[0.65rem] text-muted">
            {minuteLabel(gap.startMinute)} · {formatGapDuration(gap.durationMinutes)}
          </span>
        </span>

        {gap.task && onSchedule && state === "done" && (
          <span className="flex shrink-0 items-center gap-1 text-[0.65rem] text-accent-health">
            <Check size={11} aria-hidden />
            נקבע
          </span>
        )}
        {gap.task && onSchedule && state !== "done" && roomy && (
          <button
            onClick={schedule}
            disabled={state === "scheduling"}
            className="focus-ring flex shrink-0 items-center gap-1 rounded-lg bg-ink px-2 py-1 text-[0.65rem] font-medium text-[var(--background)] disabled:opacity-50"
          >
            {state === "scheduling" ? (
              <Loader2 size={10} className="animate-spin" aria-hidden />
            ) : (
              <CalendarPlus size={10} aria-hidden />
            )}
            קבע כאן
          </button>
        )}
      </div>

      {gap.task && roomy && state !== "done" && (
        <p className="mt-0.5 truncate text-[0.7rem] text-foreground/70">אפשר: {gap.task.title}</p>
      )}
    </div>
  );
}

export function VerticalTimeline({
  day,
  events,
  chronotype,
  observedEnergy,
  now,
  fromHour = 7,
  toHour = 23,
  onDeleteEvent,
  gaps = [],
  onScheduleGapTask,
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

  const gridStartMin = fromHour * 60;
  const gridEndMin = toHour * 60;

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

  const positionedGaps = useMemo(() => {
    return gaps
      .map((gap) => {
        const start = Math.max(gap.startMinute, gridStartMin);
        const end = Math.min(gap.endMinute, gridEndMin);
        if (end - start < 30) return null;
        const topRem = ((start - gridStartMin) / 60) * ROW_HEIGHT_REM;
        const heightRem = ((end - start) / 60) * ROW_HEIGHT_REM;
        return { gap, topRem, heightRem };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [gaps, gridStartMin, gridEndMin]);

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

        {/* Free-time bands: behind the events, above the hour banding. */}
        {positionedGaps.map(({ gap, topRem, heightRem }) => (
          <GapBand
            key={gap.id}
            gap={gap}
            topRem={topRem}
            heightRem={heightRem}
            onSchedule={onScheduleGapTask}
          />
        ))}

        {/* Events float above the banding, inset past the hour gutter. */}
        {positioned.map(({ event, topRem, heightRem }, i) => (
          <motion.div
            key={event.id}
            initial={reduce ? false : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
            className="group absolute end-0 start-16 flex items-start gap-2 overflow-hidden rounded-xl border border-hairline-card bg-surface px-3 py-2 shadow-[0_1px_2px_rgba(16,16,20,0.04),0_10px_24px_-18px_rgba(16,16,20,0.25)]"
            style={{ top: `${topRem + 0.15}rem`, minHeight: `${heightRem - 0.3}rem` }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
              <p className="ltr text-xs text-muted">{clockRange(event.start, event.end)}</p>
            </div>
            {onDeleteEvent && (
              <DeleteEventButton event={event} onRequest={onDeleteEvent} className="-me-1 mt-0.5" />
            )}
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
