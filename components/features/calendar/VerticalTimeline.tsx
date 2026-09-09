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

// The hour-label column, on the inline-start (right, in this RTL app) edge.
// Everything else — hour rules, energy tints, events, gap bands, the now
// marker — lives inside the *content lane*, a separate positioned box that
// begins where this gutter ends. Nothing in the lane can draw over the hours
// because they are not in the same box.
const GUTTER_REM = 3.25;

// Gap between two side-by-side event columns, as a fraction of one column.
// A small fixed fraction reads cleanly at any lane width without the
// brittle nested calc() the previous layout used.
const COLUMN_GAP_FRACTION = 0.04;

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

// Horizontal placement of a card within the content lane, expressed purely
// in percentages of the lane so it stays correct at any width and in either
// writing direction (insetInlineStart / width are logical).
function columnPlacement(column: number, columns: number): { insetInlineStart: string; width: string } {
  if (columns <= 1) return { insetInlineStart: "0%", width: "100%" };
  const slice = 100 / columns;
  const gap = slice * COLUMN_GAP_FRACTION;
  return {
    insetInlineStart: `${column * slice + (column === 0 ? 0 : gap / 2)}%`,
    width: `${slice - (column === 0 || column === columns - 1 ? gap / 2 : gap)}%`,
  };
}

// One event card. Positioned inside the content lane; overlapping events are
// split into side-by-side columns by layoutDayEvents.
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

  const cardHeight = Math.max(height - 0.15, 1.55);
  // Only ever render what actually fits: allocate the card's height to
  // padding, then whole title lines, then (if there is still room) the time
  // row. This is what stops the old layout clipping the last line mid-glyph
  // — the "חצאי מילים" — when it tried to show a time row plus two lines in
  // a one-line slot.
  const compact = cardHeight < 2.2;
  const LINE_REM = 1.02;
  const usable = cardHeight - (compact ? 0.35 : 0.85);
  let titleLines = Math.max(1, Math.floor(usable / LINE_REM));
  // The time row is worth its line only on a card wide enough to read it and
  // tall enough to spare the room — otherwise the position on the grid
  // already says when, and the space is better spent on the title.
  const showTime = !compact && columns <= 2 && cardHeight >= 3.4 && titleLines > 1;
  if (showTime) titleLines -= 1;
  titleLines = Math.min(titleLines, 4);
  const clampClass = ["line-clamp-1", "line-clamp-1", "line-clamp-2", "line-clamp-3", "line-clamp-4"][titleLines];
  const place = columnPlacement(column, columns);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.24), ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group absolute flex flex-col overflow-hidden rounded-lg border bg-surface",
        compact ? "px-2 py-0.5" : "px-2.5 py-1.5",
        canShift
          ? "border-gold-line shadow-[0_0_0_1px_var(--gold-line)]"
          : "border-hairline-card shadow-[0_1px_2px_rgba(16,16,20,0.04),0_8px_20px_-16px_rgba(16,16,20,0.22)]"
      )}
      style={{
        top: `${top + 0.1}rem`,
        height: `${cardHeight}rem`,
        ...place,
      }}
    >
      <div className={cn("flex min-w-0 gap-1", compact ? "items-center" : "items-start")}>
        <p
          className={cn(
            "min-w-0 flex-1 break-words font-medium leading-[1.15] text-foreground",
            compact ? "truncate text-xs leading-none" : cn("text-sm", clampClass)
          )}
          title={event.title}
        >
          {event.title}
        </p>
        {canShift ? (
          <div
            className={cn(
              "flex shrink-0 gap-0.5",
              !compact && columns >= 3 ? "flex-col" : "items-center"
            )}
          >
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
          onDeleteEvent && (
            <DeleteEventButton
              event={event}
              onRequest={onDeleteEvent}
              size={compact ? "sm" : "md"}
              className="-me-1"
            />
          )
        )}
      </div>
      {showTime && (
        <p className="ltr mt-0.5 shrink-0 text-[0.7rem] leading-none tabular-nums text-muted">
          {clockRange(event.start, event.end)}
        </p>
      )}
      {error && <p className="mt-0.5 shrink-0 text-[0.62rem] leading-tight text-red-500">{error}</p>}
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
      className="pointer-events-none absolute inset-x-0"
      style={{ top: `${topRem}rem`, height: `${heightRem}rem` }}
    >
      {/* The extent of the free stretch: one faint dashed hairline down the
          inline-start edge. No fill — the events stay the only solid things. */}
      <span
        className="absolute inset-y-1 start-0 w-px border-s border-dashed"
        style={{ borderColor: `color-mix(in srgb, var(${accent}) 45%, transparent)` }}
        aria-hidden
      />

      <div className="pointer-events-auto absolute -top-2 start-1.5 flex items-center gap-1.5">
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
        <div className="pointer-events-auto absolute start-2 top-3 z-20 flex w-max max-w-[15rem] flex-col gap-1.5 rounded-lg border border-hairline-card bg-surface p-2 shadow-md">
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
    <div className="relative w-full" style={{ height: `${gridHeightRem}rem` }}>
      {/* Hour labels — in the fixed gutter on the inline-start edge, nothing
          else is allowed in this column. */}
      {hours.map((hour, i) => (
        <span
          key={`label-${hour}`}
          className="ltr absolute start-0 flex w-12 items-start justify-start pt-1 text-xs tabular-nums text-muted"
          style={{ top: `${i * ROW_HEIGHT_REM}rem` }}
        >
          {hourLabel(hour)}
        </span>
      ))}

      {/* The content lane: begins where the gutter ends and runs to the far
          edge. It is the positioning context for everything below, so every
          child's 0%–100% is measured across the lane, not the whole grid. */}
      <div
        className="absolute inset-y-0 end-0"
        style={{ insetInlineStart: `${GUTTER_REM}rem` }}
      >
        {/* Hour rules + energy tint. */}
        {hours.map((hour, i) => {
          const energy = energyForHour(hour, chronotype, observedEnergy);
          const style = ENERGY_STYLE[energy];
          const isBandStart =
            i === 0 || energyForHour(hours[i - 1], chronotype, observedEnergy) !== energy;
          return (
            <div
              key={hour}
              className={cn("absolute inset-x-0 border-t border-hairline-card", style.row)}
              style={{ top: `${i * ROW_HEIGHT_REM}rem`, height: `${ROW_HEIGHT_REM}rem` }}
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
          );
        })}

        {/* Free-time bands, behind the events. */}
        {positionedGaps.map(({ gap, topRem, heightRem }) => (
          <GapLine key={gap.id} gap={gap} topRem={topRem} heightRem={heightRem} onSchedule={onScheduleGapTask} />
        ))}

        {/* Events — column-laid-out inside the lane. */}
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
            <span className="size-1.5 shrink-0 rounded-full bg-[var(--gold)]" />
            <span className="h-px flex-1 bg-[var(--gold)]/50" />
          </div>
        )}
      </div>
    </div>
  );
}
