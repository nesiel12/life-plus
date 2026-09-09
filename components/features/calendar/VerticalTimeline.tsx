"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, Check, ChevronDown, ChevronUp, Loader2, Moon, Plus, Sparkles, TrendingDown, X } from "lucide-react";
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
  /** Schedules something into a free slot — the gap's suggested task, or a
   *  title the user typed straight into the slot. `taskId` is present only
   *  for the former. Resolves when the write lands; the timeline refetches
   *  from the parent. */
  onScheduleGapTask?: (input: {
    taskId?: string;
    title: string;
    startMinute: number;
    endMinute: number;
  }) => Promise<void>;
  /** Edit Mode: show per-event hour-shift controls. */
  editMode?: boolean;
  /** Shift one event by whole minutes (±15). Rejects with a message on failure. */
  onShiftEvent?: (event: TimelineEvent, deltaMinutes: number) => Promise<void>;
}

// Compact View: a uniform, tight hour row (was 2.75rem). Every vertical
// measurement in the grid is derived from this one constant, so the timeline
// stays a true mathematical projection of the day — top and height are pure
// functions of clock time, never hand-tuned per event.
const ROW_HEIGHT_REM = 2.5;

// The hour-label column, on the inline-start (right, in this RTL app) edge.
// Everything else — hour rules, energy tints, events, gap bands, the now
// marker — lives inside the *content lane*, a separate positioned box that
// begins where this gutter ends. Nothing in the lane can draw over the hours
// because they are not in the same box.
const GUTTER_REM = 3.25;

// The seam between two side-by-side event columns, as a % of the lane. Small
// and fixed so it reads cleanly at any width.
const COLUMN_GAP_PCT = 1.4;

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
  const h = Math.floor(minute / 60) % 24;
  const m = Math.round(minute % 60);
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

// Exact horizontal placement of a card within its overlap cluster: N equal
// columns, each `(100 - gaps)/N` wide, offset by its column index. Non-
// overlapping events (columns === 1) take the full lane.
function columnPlacement(column: number, columns: number): { insetInlineStart: string; width: string } {
  if (columns <= 1) return { insetInlineStart: "0%", width: "100%" };
  const totalGap = COLUMN_GAP_PCT * (columns - 1);
  const col = (100 - totalGap) / columns;
  return {
    insetInlineStart: `${column * (col + COLUMN_GAP_PCT)}%`,
    width: `${col}%`,
  };
}

// One event card. Positioned inside the content lane; overlapping events are
// split into side-by-side columns by layoutDayEvents.
function EventBlock({
  event,
  topPct,
  heightPct,
  heightRem,
  column,
  columns,
  reduce,
  index,
  onDeleteEvent,
  editMode,
  onShiftEvent,
}: {
  event: TimelineEvent;
  /** % of the grid height */
  topPct: number;
  heightPct: number;
  /** the same height in rem, for the text-budget math */
  heightRem: number;
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

  // Render only what fits: allocate the card's height to padding, then whole
  // title lines, then a time row only when there is still room. This is what
  // stops the last line being sheared through the middle of the glyphs.
  const usableRem = Math.max(heightRem - 0.15, 1.4);
  const compact = usableRem < 2.2;
  const LINE_REM = 1.02;
  const budget = usableRem - (compact ? 0.35 : 0.85);
  let titleLines = Math.max(1, Math.floor(budget / LINE_REM));
  const showTime = !compact && columns <= 2 && usableRem >= 3.4 && titleLines > 1;
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
        "group absolute z-[2] flex flex-col overflow-hidden rounded-lg border bg-surface",
        compact ? "px-2 py-0.5" : "px-2.5 py-1.5",
        canShift
          ? "border-gold-line shadow-[0_0_0_1px_var(--gold-line)]"
          : "border-hairline-card shadow-[0_1px_2px_rgba(16,16,20,0.04),0_8px_20px_-16px_rgba(16,16,20,0.22)]"
      )}
      style={{
        top: `${topPct}%`,
        height: `calc(${heightPct}% - 2px)`,
        minHeight: "1.4rem",
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

// A free window in the day. Renders a faint band you can act inside: a
// "קבע כאן" pill that expands to either the app's own suggestion for the
// slot or a one-line title field, and writes a real calendar event.
function GapBand({
  gap,
  topPct,
  heightPct,
  onSchedule,
}: {
  gap: TimelineGap;
  topPct: number;
  heightPct: number;
  onSchedule?: VerticalTimelineProps["onScheduleGapTask"];
}) {
  const [phase, setPhase] = useState<"rest" | "open" | "saving" | "done">("rest");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accent = gap.accentVar ?? "--muted";

  // Cap the slot at 60 minutes — a suggestion drops a focused block into the
  // window, it doesn't claim the whole afternoon.
  const slotStart = gap.startMinute;
  const slotEnd = Math.min(gap.endMinute, slotStart + 60);

  function schedule(withTitle: string, taskId?: string) {
    const t = withTitle.trim();
    if (!t || !onSchedule) return;
    setPhase("saving");
    setError(null);
    onSchedule({ taskId, title: t, startMinute: slotStart, endMinute: slotEnd })
      .then(() => setPhase("done"))
      .catch((err: unknown) => {
        setPhase("open");
        setError(err instanceof Error ? err.message : "לא הצלחנו להוסיף ליומן.");
      });
  }

  const tall = heightPct > 6;

  return (
    <div
      className="absolute inset-x-0 z-[1]"
      style={{ top: `${topPct}%`, height: `${heightPct}%` }}
    >
      {/* The window itself — a barely-there tint, dashed on the leading edge,
          so free time reads as usable space without competing with events. */}
      <div
        className="pointer-events-none absolute inset-x-0 inset-y-0.5 rounded-md border border-dashed"
        style={{
          borderColor: `color-mix(in srgb, var(${accent}) 30%, transparent)`,
          background: `color-mix(in srgb, var(${accent}) 4%, transparent)`,
        }}
        aria-hidden
      />

      <div className={cn("absolute start-2 flex flex-wrap items-center gap-1.5", tall ? "top-1.5" : "top-1/2 -translate-y-1/2")}>
        <span
          className="rounded-full bg-background/90 px-1.5 text-[0.65rem] font-medium"
          style={{ color: `color-mix(in srgb, var(${accent}) 80%, var(--foreground))` }}
        >
          {gap.label}
        </span>
        <span className="ltr rounded-full bg-background/90 px-1 text-[0.6rem] tabular-nums text-muted">
          {formatGapDuration(gap.durationMinutes)}
        </span>

        {phase === "done" && (
          <span className="flex items-center gap-0.5 rounded-full bg-background/90 px-1 text-[0.6rem] text-accent-health">
            <Check size={9} aria-hidden />
            נקבע
          </span>
        )}

        {phase === "rest" && onSchedule && (
          <button
            onClick={() => setPhase("open")}
            className="focus-ring flex items-center gap-0.5 rounded-full border border-hairline-card bg-background/90 px-1.5 py-0.5 text-[0.6rem] font-medium text-gold-ink transition-colors hover:bg-fill-subtle"
          >
            <Plus size={9} aria-hidden />
            הצע פעילות
          </button>
        )}
      </div>

      {(phase === "open" || phase === "saving") && onSchedule && (
        <div className="absolute start-2 top-7 z-20 flex w-max max-w-[15rem] flex-col gap-1.5 rounded-lg border border-hairline-card bg-surface p-2 shadow-md">
          <div className="flex items-center justify-between gap-2">
            <span className="ltr text-[0.65rem] tabular-nums text-muted">
              {minuteLabel(slotStart)}–{minuteLabel(slotEnd)}
            </span>
            <button
              onClick={() => {
                setPhase("rest");
                setError(null);
              }}
              aria-label="בטל"
              className="focus-ring text-muted hover:text-foreground"
            >
              <X size={11} aria-hidden />
            </button>
          </div>

          {gap.task && (
            <button
              onClick={() => schedule(gap.task!.title, gap.task!.id)}
              disabled={phase === "saving"}
              className="focus-ring flex items-center gap-1 rounded-md bg-gold-soft px-2 py-1 text-start text-[0.65rem] font-medium text-gold-ink disabled:opacity-50"
            >
              <Sparkles size={9} className="shrink-0" aria-hidden />
              <span className="truncate">{gap.task.title}</span>
            </button>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              schedule(title);
            }}
            className="flex gap-1"
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="מה לקבוע כאן?"
              aria-label="שם הפעילות"
              autoFocus
              className="focus-ring w-36 rounded-md border border-hairline-card bg-surface-sunken px-2 py-1 text-[0.7rem] text-foreground placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={phase === "saving" || !title.trim()}
              className="focus-ring grid size-6 shrink-0 place-items-center rounded-md bg-ink text-[var(--background)] disabled:opacity-50"
              aria-label="קבע ביומן"
            >
              {phase === "saving" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <CalendarPlus size={10} aria-hidden />}
            </button>
          </form>

          {error && <p className="text-[0.62rem] text-red-500">{error}</p>}
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
  const totalMin = gridEndMin - gridStartMin;
  const gridHeightRem = hours.length * ROW_HEIGHT_REM;

  // Strict mathematical projection: an event's vertical geometry is a pure
  // function of its clock time.
  //   topPct    = (start - dayStart) / totalDayMinutes * 100
  //   heightPct = duration           / totalDayMinutes * 100
  // layoutDayEvents does exactly this (as 0–1 fractions) and additionally
  // resolves overlaps into columns via an interval-graph greedy pack.
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
      topPct: p.top * 100,
      heightPct: p.height * 100,
      heightRem: p.height * gridHeightRem,
      column: p.column,
      columns: p.columns,
    }));
  }, [events, gridStartMin, gridEndMin, gridHeightRem]);

  const positionedGaps = useMemo(() => {
    return gaps
      .map((gap) => {
        const start = Math.max(gap.startMinute, gridStartMin);
        const end = Math.min(gap.endMinute, gridEndMin);
        if (end - start < 30) return null;
        return {
          gap,
          topPct: ((start - gridStartMin) / totalMin) * 100,
          heightPct: ((end - start) / totalMin) * 100,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [gaps, gridStartMin, gridEndMin, totalMin]);

  const nowPct = useMemo(() => {
    if (!now) return null;
    const minute = now.getHours() * 60 + now.getMinutes();
    if (minute < gridStartMin || minute > gridEndMin) return null;
    return ((minute - gridStartMin) / totalMin) * 100;
  }, [now, gridStartMin, gridEndMin, totalMin]);

  void day;

  return (
    <div className="relative w-full" style={{ height: `${gridHeightRem}rem` }}>
      {/* Hour labels — in the fixed gutter on the inline-start edge, nothing
          else is allowed in this column. */}
      {hours.map((hour, i) => (
        <span
          key={`label-${hour}`}
          className="ltr absolute start-0 flex w-12 items-start justify-start pt-0.5 text-[0.7rem] tabular-nums text-muted"
          style={{ top: `${(i / hours.length) * 100}%` }}
        >
          {hourLabel(hour)}
        </span>
      ))}

      {/* The content lane: begins where the gutter ends and runs to the far
          edge. It is the positioning context for everything below, so every
          child's 0%–100% is measured across the lane, not the whole grid. */}
      <div className="absolute inset-y-0 end-0" style={{ insetInlineStart: `${GUTTER_REM}rem` }}>
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
              style={{ top: `${(i / hours.length) * 100}%`, height: `${(1 / hours.length) * 100}%` }}
            >
              <span className={cn("absolute inset-y-0 start-0 w-px", style.rail)} aria-hidden />
              {isBandStart && energy !== "neutral" && (
                <span
                  className={cn(
                    "pointer-events-none absolute start-1.5 top-0.5 inline-flex items-center gap-1 rounded-full bg-background/80 px-1 text-[0.6rem] font-medium",
                    style.badge ?? "text-muted"
                  )}
                >
                  {energy === "peak" && (
                    <>
                      <Sparkles size={9} aria-hidden />
                      שעות שיא
                    </>
                  )}
                  {energy === "low" && (
                    <>
                      <TrendingDown size={9} aria-hidden />
                      אנרגיה נמוכה
                    </>
                  )}
                  {energy === "asleep" && (
                    <>
                      <Moon size={9} aria-hidden />
                      שינה
                    </>
                  )}
                </span>
              )}
            </div>
          );
        })}

        {/* Free-time windows, behind the events. */}
        {positionedGaps.map(({ gap, topPct, heightPct }) => (
          <GapBand
            key={gap.id}
            gap={gap}
            topPct={topPct}
            heightPct={heightPct}
            onSchedule={onScheduleGapTask}
          />
        ))}

        {/* Events — column-laid-out inside the lane. */}
        {placed.map(({ event, topPct, heightPct, heightRem, column, columns }, i) => (
          <EventBlock
            key={event.id}
            event={event}
            topPct={topPct}
            heightPct={heightPct}
            heightRem={heightRem}
            column={column}
            columns={columns}
            reduce={reduce}
            index={i}
            onDeleteEvent={onDeleteEvent}
            editMode={editMode}
            onShiftEvent={onShiftEvent}
          />
        ))}

        {nowPct !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 z-[3] flex items-center gap-1"
            style={{ top: `${nowPct}%` }}
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
