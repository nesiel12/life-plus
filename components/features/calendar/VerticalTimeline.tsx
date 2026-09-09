"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, Check, ChevronDown, ChevronUp, Loader2, Moon, Sparkles, TrendingDown } from "lucide-react";
import { energyForHour, type HourEnergy, type ObservedEnergy } from "@/lib/calendar/energy";
import { DeleteEventButton, type DeletableEvent } from "@/components/features/calendar/DeleteEventDialog";
import { layoutDayEvents, minutesIntoDay } from "@/lib/calendar/layoutDayEvents";
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
  /** Edit Mode: show per-event hour-shift controls. */
  editMode?: boolean;
  /** Shift one event by whole minutes (±15). Rejects with a message on failure. */
  onShiftEvent?: (event: TimelineEvent, deltaMinutes: number) => Promise<void>;
}

// Tighter than it once was: an 18-hour column at 3.5rem/row was a screenful
// of mostly-empty rows before the first event.
const ROW_HEIGHT_REM = 2.75;

// The hour-label column. Events live strictly to the inline-end of this, so a
// meeting can never sit on top of the time it starts at — the old layout put
// events at `start-16` while the labels also drifted, and on a narrow screen
// they overlapped and hid the hours.
const GUTTER_REM = 3.25;
// A hair of room on the far edge so a card isn't jammed against the border.
const EDGE_GAP_REM = 0.25;

// Luxe, not glass: an opaque surface, hairline rules, and gold reserved for
// the single thing that matters most — the user's peak-focus band.
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

const SHIFT_STEP_MINUTES = 15;

// The inline-start / inline-end insets for a card in column `column` of
// `columns`, keeping every card inside the content lane (past the gutter).
function laneInsets(column: number, columns: number): { insetInlineStart: string; insetInlineEnd: string } {
  // Lane width = 100% - GUTTER - EDGE_GAP. Each column takes an equal slice
  // of that lane; express the slice with calc() so it stays responsive.
  const startFrac = column / columns;
  const endFrac = (columns - 1 - column) / columns;
  return {
    insetInlineStart: `calc(${GUTTER_REM}rem + (100% - ${GUTTER_REM}rem - ${EDGE_GAP_REM}rem) * ${startFrac} + ${
      column > 0 ? "1px" : "0px"
    })`,
    insetInlineEnd: `calc(${EDGE_GAP_REM}rem + (100% - ${GUTTER_REM}rem - ${EDGE_GAP_REM}rem) * ${endFrac} + ${
      column < columns - 1 ? "1px" : "0px"
    })`,
  };
}

// One event card, positioned inside the content lane and split into a
// side-by-side column when it overlaps a neighbour.
function EventBlock({
  event,
  top,
  height,
  column,
  columns,
  reduce,
  index,
  onDeleteEvent,
  editMode,
  onShiftEvent,
}: {
  event: TimelineEvent;
  /** rem from the top of the grid */
  top: number;
  /** rem */
  height: number;
  column: number;
  columns: number;
  reduce: boolean | null;
  index: number;
  onDeleteEvent?: (event: DeletableEvent) => void;
  editMode?: boolean;
  onShiftEvent?: (event: TimelineEvent, deltaMinutes: number) => Promise<void>;
}) {
  const [shifting, setShifting] = useState<"up" | "down" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canShift = editMode && event.canEdit !== false && Boolean(onShiftEvent);

  function shift(delta: number) {
    if (!onShiftEvent || shifting) return;
    setShifting(delta < 0 ? "up" : "down");
    setError(null);
    onShiftEvent(event, delta)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "לא הצלחנו להזיז את האירוע."))
      .finally(() => setShifting(null));
  }

  const short = height < 2;
  const insets = laneInsets(column, columns);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-lg border bg-surface px-2.5 py-1.5",
        canShift
          ? "border-gold-line shadow-[0_0_0_1px_var(--gold-line)]"
          : "border-hairline-card shadow-[0_1px_2px_rgba(16,16,20,0.04),0_8px_20px_-16px_rgba(16,16,20,0.22)]"
      )}
      style={{
        top: `${top + 0.1}rem`,
        height: `${Math.max(height - 0.2, 1.4)}rem`,
        ...insets,
      }}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        <p className={cn("min-w-0 flex-1 truncate font-medium text-foreground", short ? "text-xs" : "text-sm")}>
          {event.title}
        </p>
        {canShift ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => shift(-SHIFT_STEP_MINUTES)}
              disabled={Boolean(shifting)}
              aria-label={`הקדם את ${event.title} ברבע שעה`}
              className="focus-ring grid size-5 place-items-center rounded bg-fill-subtle text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {shifting === "up" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <ChevronUp size={11} aria-hidden />}
            </button>
            <button
              onClick={() => shift(SHIFT_STEP_MINUTES)}
              disabled={Boolean(shifting)}
              aria-label={`דחה את ${event.title} ברבע שעה`}
              className="focus-ring grid size-5 place-items-center rounded bg-fill-subtle text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {shifting === "down" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <ChevronDown size={11} aria-hidden />}
            </button>
          </div>
        ) : (
          onDeleteEvent && <DeleteEventButton event={event} onRequest={onDeleteEvent} className="-me-1" />
        )}
      </div>
      {!short && <p className="ltr mt-0.5 text-[0.7rem] text-muted">{clockRange(event.start, event.end)}</p>}
      {error && <p className="mt-0.5 text-[0.62rem] text-red-500">{error}</p>}
    </motion.div>
  );
}

function GapLine({
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
  const [phase, setPhase] = useState<"rest" | "confirm" | "scheduling" | "done">("rest");
  const [error, setError] = useState<string | null>(null);
  const accent = gap.accentVar ?? "--muted";

  const slotStart = gap.startMinute;
  const slotEnd = Math.min(gap.endMinute, slotStart + 60);

  function confirm() {
    if (!gap.task || !onSchedule) return;
    setPhase("scheduling");
    setError(null);
    onSchedule({ taskId: gap.task.id, title: gap.task.title, startMinute: slotStart, endMinute: slotEnd })
      .then(() => setPhase("done"))
      .catch((err: unknown) => {
        setPhase("confirm");
        setError(err instanceof Error ? err.message : "לא הצלחנו להוסיף ליומן.");
      });
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        top: `${topRem}rem`,
        height: `${heightRem}rem`,
        insetInlineStart: `${GUTTER_REM}rem`,
        insetInlineEnd: `${EDGE_GAP_REM}rem`,
      }}
    >
      {/* The extent of the free stretch: one faint dashed hairline down the
          inline-start edge. No fill — the events stay the only solid things. */}
      <span
        className="absolute inset-y-1 start-0 w-px border-s border-dashed"
        style={{ borderColor: `color-mix(in srgb, var(${accent}) 45%, transparent)` }}
        aria-hidden
      />

      <div className="pointer-events-auto absolute -top-2 start-2 flex items-center gap-1.5">
        <span
          className="rounded-full bg-background px-1.5 text-[0.65rem] font-medium"
          style={{ color: `color-mix(in srgb, var(${accent}) 80%, var(--foreground))` }}
        >
          {gap.label}
        </span>
        <span className="ltr rounded-full bg-background px-1 text-[0.6rem] tabular-nums text-muted">
          {formatGapDuration(gap.durationMinutes)}
        </span>

        {gap.task && onSchedule && phase === "done" && (
          <span className="flex items-center gap-0.5 rounded-full bg-background px-1 text-[0.6rem] text-accent-health">
            <Check size={9} aria-hidden />
            נקבע
          </span>
        )}
        {gap.task && onSchedule && phase === "rest" && (
          <button
            onClick={() => setPhase("confirm")}
            className="focus-ring rounded-full bg-background px-1 text-[0.6rem] font-medium text-gold-ink underline decoration-dotted underline-offset-2"
          >
            קבע כאן
          </button>
        )}
      </div>

      {gap.task && (phase === "confirm" || phase === "scheduling") && (
        <div className="pointer-events-auto absolute start-2 top-3 z-20 flex w-max max-w-[16rem] flex-col gap-1.5 rounded-lg border border-hairline-card bg-surface p-2 shadow-md">
          <p className="text-[0.7rem] text-foreground">
            לקבוע את <span className="font-medium">{gap.task.title}</span>{" "}
            <span className="ltr tabular-nums text-muted">
              {minuteLabel(slotStart)}–{minuteLabel(slotEnd)}
            </span>
            ?
          </p>
          {error && <p className="text-[0.65rem] text-red-500">{error}</p>}
          <div className="flex gap-1.5">
            <button
              onClick={confirm}
              disabled={phase === "scheduling"}
              className="focus-ring flex items-center gap-1 rounded-md bg-ink px-2 py-1 text-[0.65rem] font-medium text-[var(--background)] disabled:opacity-50"
            >
              {phase === "scheduling" ? (
                <Loader2 size={10} className="animate-spin" aria-hidden />
              ) : (
                <CalendarPlus size={10} aria-hidden />
              )}
              קבע ביומן
            </button>
            <button
              onClick={() => {
                setPhase("rest");
                setError(null);
              }}
              disabled={phase === "scheduling"}
              className="focus-ring rounded-md px-2 py-1 text-[0.65rem] text-muted hover:text-foreground disabled:opacity-50"
            >
              ביטול
            </button>
          </div>
        </div>
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
  editMode = false,
  onShiftEvent,
}: VerticalTimelineProps) {
  const reduce = useReducedMotion();

  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );

  const gridStartMin = fromHour * 60;
  const gridEndMin = toHour * 60;
  const gridHeightRem = hours.length * ROW_HEIGHT_REM;

  // Column layout: overlapping events split side by side rather than stacking
  // on top of each other. `layoutDayEvents` returns top/height as fractions
  // of the whole grid, which we scale to rem.
  const placed = useMemo(() => {
    const spans = layoutDayEvents(
      events,
      (event) => ({
        startMinute: minutesIntoDay(new Date(event.start)),
        endMinute: minutesIntoDay(new Date(event.end)),
      }),
      gridStartMin,
      gridEndMin
    );
    return spans.map((p) => ({
      event: p.event,
      top: p.top * gridHeightRem,
      height: p.height * gridHeightRem,
      column: p.column,
      columns: p.columns,
    }));
  }, [events, gridStartMin, gridEndMin, gridHeightRem]);

  const positionedGaps = useMemo(() => {
    return gaps
      .map((gap) => {
        const start = Math.max(gap.startMinute, gridStartMin);
        const end = Math.min(gap.endMinute, gridEndMin);
        if (end - start < 25) return null;
        const topRem = ((start - gridStartMin) / 60) * ROW_HEIGHT_REM;
        const heightRem = ((end - start) / 60) * ROW_HEIGHT_REM;
        return { gap, topRem, heightRem };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [gaps, gridStartMin, gridEndMin]);

  const nowOffsetRem = useMemo(() => {
    if (!now) return null;
    const minute = now.getHours() * 60 + now.getMinutes();
    if (minute < gridStartMin || minute > gridEndMin) return null;
    return ((minute - gridStartMin) / 60) * ROW_HEIGHT_REM;
  }, [now, gridStartMin, gridEndMin]);

  void day;

  return (
    <div className="relative" style={{ height: `${gridHeightRem}rem` }}>
      {/* Hour rows. The label sits in the fixed gutter; the hairline + energy
          tint span only the content lane, so nothing draws over the hours. */}
      {hours.map((hour, i) => {
        const energy = energyForHour(hour, chronotype, observedEnergy);
        const style = ENERGY_STYLE[energy];
        const isBandStart =
          i === 0 || energyForHour(hours[i - 1], chronotype, observedEnergy) !== energy;
        return (
          <div
            key={hour}
            className="absolute inset-x-0"
            style={{ top: `${i * ROW_HEIGHT_REM}rem`, height: `${ROW_HEIGHT_REM}rem` }}
          >
            <span className="ltr absolute inset-y-0 start-0 flex w-12 items-start pt-1 text-xs tabular-nums text-muted">
              {hourLabel(hour)}
            </span>
            <div
              className={cn("absolute inset-y-0 border-t border-hairline-card", style.row)}
              style={{ insetInlineStart: `${GUTTER_REM}rem`, insetInlineEnd: 0 }}
            >
              <span className={cn("absolute inset-y-0 start-0 w-px", style.rail)} aria-hidden />
              {isBandStart && energy !== "neutral" && (
                <span
                  className={cn(
                    "pointer-events-none absolute start-1.5 top-1 inline-flex items-center gap-1 rounded-full bg-background/80 px-1 text-[0.62rem] font-medium",
                    style.badge ?? "text-muted"
                  )}
                >
                  {energy === "peak" && (
                    <>
                      <Sparkles size={10} aria-hidden />
                      שעות שיא
                    </>
                  )}
                  {energy === "low" && (
                    <>
                      <TrendingDown size={10} aria-hidden />
                      אנרגיה נמוכה
                    </>
                  )}
                  {energy === "asleep" && (
                    <>
                      <Moon size={10} aria-hidden />
                      שינה
                    </>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Free-time bands, behind the events. */}
      {positionedGaps.map(({ gap, topRem, heightRem }) => (
        <GapLine key={gap.id} gap={gap} topRem={topRem} heightRem={heightRem} onSchedule={onScheduleGapTask} />
      ))}

      {/* Events — column-laid-out, never over the gutter. */}
      {placed.map(({ event, top, height, column, columns }, i) => (
        <EventBlock
          key={event.id}
          event={event}
          top={top}
          height={height}
          column={column}
          columns={columns}
          reduce={reduce}
          index={i}
          onDeleteEvent={onDeleteEvent}
          editMode={editMode}
          onShiftEvent={onShiftEvent}
        />
      ))}

      {nowOffsetRem !== null && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-1"
          style={{ top: `${nowOffsetRem}rem` }}
          aria-hidden
        >
          <span className="ms-11 size-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
          <span className="h-px flex-1 bg-[var(--gold)]/50" />
        </div>
      )}
    </div>
  );
}
