"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CalendarPlus, Check, ChevronDown, ChevronUp, Loader2, Plus, Sparkles, X } from "lucide-react";
import { energyForHour, type ObservedEnergy } from "@/lib/calendar/energy";
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
  /** CSS custom-property name (e.g. "--accent-career") the event is coloured
   *  with. Falls back to a neutral accent. */
  accentVar?: string;
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

// One hour of vertical space. 48px is the professional-calendar standard
// (Google's default day-view zoom) — comfortable, not cramped. Every vertical
// measurement in the grid derives from this, so the timeline is a true
// mathematical projection of the day: an event's top and height are pure
// functions of its clock time, never hand-tuned.
const HOUR_PX = 48;
const HALF_HOUR_PX = HOUR_PX / 2;

// The hour-label column, on the inline-start (right, in this RTL app) edge.
// Everything else lives in the content lane, a separate box that starts where
// this ends — so no event can ever draw over an hour label.
const GUTTER_PX = 56;
const EDGE_GAP_PX = 4;

// The seam between two side-by-side event columns, as a % of the lane.
const COLUMN_GAP_PCT = 1.6;

const DEFAULT_ACCENT = "--accent-career";

function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  return `${String(h).padStart(2, "0")}:00`;
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

// One event card. Positioned inside the content lane by absolute px offsets
// derived from clock time; overlapping events are split into side-by-side
// columns by layoutDayEvents.
function EventBlock({
  event,
  topPx,
  heightPx,
  column,
  columns,
  reduce,
  index,
  onDeleteEvent,
  editMode,
  onShiftEvent,
}: {
  event: TimelineEvent;
  topPx: number;
  heightPx: number;
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
  const accent = event.accentVar ?? DEFAULT_ACCENT;

  function shift(delta: number) {
    if (!onShiftEvent || shifting) return;
    setShifting(delta < 0 ? "up" : "down");
    setError(null);
    onShiftEvent(event, delta)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "לא הצלחנו להזיז את האירוע."))
      .finally(() => setShifting(null));
  }

  // Show only what fits, measured against the real px height: padding first,
  // then whole title lines at ~15.5px each, then a time row when there is
  // still room. This is what stops a line being sheared through the middle of
  // the glyphs on a short event.
  const inner = Math.max(heightPx - 8, 16);
  const compact = inner < 30;
  const LINE_PX = 15.5;
  const budget = inner - (compact ? 4 : 12);
  let titleLines = Math.max(1, Math.floor(budget / LINE_PX));
  // Room for the time row: shown on anything that isn't a sliver, in a
  // column wide enough to read it. Steal a title line for it only when there
  // is more than one to give.
  const showTime = !compact && columns <= 2 && inner >= 34;
  if (showTime && titleLines > 1) titleLines -= 1;
  titleLines = Math.min(titleLines, 5);
  const clampClass =
    ["line-clamp-1", "line-clamp-1", "line-clamp-2", "line-clamp-3", "line-clamp-4", "line-clamp-5"][titleLines];
  const place = columnPlacement(column, columns);

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: Math.min(index * 0.025, 0.2), ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group absolute z-[2] flex flex-col overflow-hidden rounded-lg border shadow-[0_1px_2px_rgba(16,16,20,0.05)]",
        canShift && "ring-1 ring-gold-line",
        compact ? "gap-0 py-0.5 pe-1.5 ps-2" : "gap-0.5 py-1 pe-2 ps-2.5"
      )}
      style={{
        top: `${topPx}px`,
        height: `${Math.max(heightPx - 2, 18)}px`,
        borderColor: `color-mix(in srgb, var(${accent}) 32%, var(--hairline-card))`,
        background: `color-mix(in srgb, var(${accent}) 8%, var(--surface))`,
        // The colour bar down the leading edge — the single strongest "which
        // event is this" cue on a busy day.
        boxShadow: `inset 3px 0 0 0 var(${accent})`,
        ...place,
      }}
    >
      <div className={cn("flex min-w-0 gap-1", compact ? "items-center" : "items-start")}>
        <p
          className={cn(
            "min-w-0 flex-1 break-words font-semibold leading-[1.2]",
            compact ? "truncate text-[0.78rem] leading-none" : cn("text-[0.82rem]", clampClass)
          )}
          style={{ color: `color-mix(in srgb, var(${accent}) 55%, var(--foreground))` }}
          title={event.title}
        >
          {event.title}
        </p>
        {canShift ? (
          <div className={cn("flex shrink-0 gap-0.5", !compact && columns >= 3 ? "flex-col" : "items-center")}>
            <button
              onClick={() => shift(-SHIFT_STEP_MINUTES)}
              disabled={Boolean(shifting)}
              aria-label={`הקדם את ${event.title} ברבע שעה`}
              className="focus-ring grid size-5 place-items-center rounded bg-surface/70 text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {shifting === "up" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <ChevronUp size={11} aria-hidden />}
            </button>
            <button
              onClick={() => shift(SHIFT_STEP_MINUTES)}
              disabled={Boolean(shifting)}
              aria-label={`דחה את ${event.title} ברבע שעה`}
              className="focus-ring grid size-5 place-items-center rounded bg-surface/70 text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {shifting === "down" ? <Loader2 size={10} className="animate-spin" aria-hidden /> : <ChevronDown size={11} aria-hidden />}
            </button>
          </div>
        ) : (
          onDeleteEvent && (
            <DeleteEventButton event={event} onRequest={onDeleteEvent} size={compact ? "sm" : "md"} className="-me-1" />
          )
        )}
      </div>
      {showTime && (
        <p className="ltr shrink-0 text-[0.68rem] leading-none tabular-nums text-muted">
          {clockRange(event.start, event.end)}
        </p>
      )}
      {error && <p className="shrink-0 text-[0.62rem] leading-tight text-red-500">{error}</p>}
    </motion.div>
  );
}

// A free window in the day. A faint band you can act inside: a "הצע פעילות"
// pill that expands to the app's suggestion for the slot and/or a one-line
// title field, and writes a real calendar event.
function GapBand({
  gap,
  topPx,
  heightPx,
  onSchedule,
}: {
  gap: TimelineGap;
  topPx: number;
  heightPx: number;
  onSchedule?: VerticalTimelineProps["onScheduleGapTask"];
}) {
  const [phase, setPhase] = useState<"rest" | "open" | "saving" | "done">("rest");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const accent = gap.accentVar ?? "--muted";

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

  const tall = heightPx > 64;

  return (
    <div className="absolute inset-x-0 z-[1]" style={{ top: `${topPx}px`, height: `${heightPx}px` }}>
      <div
        className="pointer-events-none absolute inset-x-0 inset-y-1 rounded-md border border-dashed"
        style={{
          borderColor: `color-mix(in srgb, var(${accent}) 28%, transparent)`,
          background: `color-mix(in srgb, var(${accent}) 3.5%, transparent)`,
        }}
        aria-hidden
      />

      <div className={cn("absolute start-2 flex flex-wrap items-center gap-1.5", tall ? "top-2" : "top-1/2 -translate-y-1/2")}>
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
        <div className="absolute start-2 top-8 z-20 flex w-max max-w-[15rem] flex-col gap-1.5 rounded-lg border border-hairline-card bg-surface p-2 shadow-md">
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
  const scrollRef = useRef<HTMLDivElement>(null);

  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );

  const gridStartMin = fromHour * 60;
  const gridEndMin = toHour * 60;
  const gridHeightPx = hours.length * HOUR_PX;

  // Strict projection: geometry is a pure function of clock time. layoutDayEvents
  // returns top/height as 0–1 fractions of the grid (start/totalDay,
  // duration/totalDay) and resolves overlaps into columns via an interval-graph
  // greedy pack.
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
      topPx: p.top * gridHeightPx,
      heightPx: p.height * gridHeightPx,
      column: p.column,
      columns: p.columns,
    }));
  }, [events, gridStartMin, gridEndMin, gridHeightPx]);

  const positionedGaps = useMemo(() => {
    return gaps
      .map((gap) => {
        const start = Math.max(gap.startMinute, gridStartMin);
        const end = Math.min(gap.endMinute, gridEndMin);
        if (end - start < 30) return null;
        return {
          gap,
          topPx: ((start - gridStartMin) / 60) * HOUR_PX,
          heightPx: ((end - start) / 60) * HOUR_PX,
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);
  }, [gaps, gridStartMin, gridEndMin]);

  const nowPx = useMemo(() => {
    if (!now) return null;
    const minute = now.getHours() * 60 + now.getMinutes();
    if (minute < gridStartMin || minute > gridEndMin) return null;
    return ((minute - gridStartMin) / 60) * HOUR_PX;
  }, [now, gridStartMin, gridEndMin]);

  // Peak-focus band: the one place the timeline still speaks about energy —
  // a faint gold wash behind the user's best hours, nothing else.
  const peakBands = useMemo(() => {
    const bands: { topPx: number; heightPx: number }[] = [];
    let runStart: number | null = null;
    for (let i = 0; i <= hours.length; i++) {
      const isPeak = i < hours.length && energyForHour(hours[i], chronotype, observedEnergy) === "peak";
      if (isPeak && runStart === null) runStart = i;
      if (!isPeak && runStart !== null) {
        bands.push({ topPx: runStart * HOUR_PX, heightPx: (i - runStart) * HOUR_PX });
        runStart = null;
      }
    }
    return bands;
  }, [hours, chronotype, observedEnergy]);

  // Open the view on the interesting part of the day: "now" if it's today,
  // else the first event, else the top. Runs when the day changes.
  const firstEventTopPx = placed.length > 0 ? Math.min(...placed.map((p) => p.topPx)) : null;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target =
      nowPx !== null
        ? nowPx - el.clientHeight / 3
        : firstEventTopPx !== null
          ? firstEventTopPx - HOUR_PX
          : 0;
    el.scrollTop = Math.max(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  return (
    <div
      ref={scrollRef}
      className="relative w-full overflow-y-auto overscroll-contain"
      style={{ maxHeight: "min(72vh, 46rem)" }}
    >
      <div className="relative w-full" style={{ height: `${gridHeightPx}px` }}>
        {/* ── Grid lines ─────────────────────────────────────────────────
            Solid hairline on the hour, a fainter dashed line on the half
            hour. The grid never moves; events are positioned onto it. */}
        {hours.map((hour, i) => (
          <div key={`h-${hour}`} aria-hidden>
            <div
              className="absolute inset-x-0 border-t border-hairline-card"
              style={{ top: `${i * HOUR_PX}px` }}
            />
            <div
              className="absolute border-t border-dashed border-hairline-card/40"
              style={{
                top: `${i * HOUR_PX + HALF_HOUR_PX}px`,
                insetInlineStart: `${GUTTER_PX}px`,
                insetInlineEnd: 0,
              }}
            />
            {i > 0 && (
              <span
                className="ltr absolute start-0 -translate-y-1/2 pe-1.5 text-right text-[0.7rem] tabular-nums text-muted"
                style={{ top: `${i * HOUR_PX}px`, width: `${GUTTER_PX}px` }}
              >
                {hourLabel(hour)}
              </span>
            )}
          </div>
        ))}
        {/* First and last labels sit flush to the top / bottom edge — centring
            them on the line would clip them against the scroll container. */}
        <span
          className="ltr absolute start-0 top-0 pe-1.5 text-right text-[0.7rem] tabular-nums text-muted"
          style={{ width: `${GUTTER_PX}px` }}
        >
          {hourLabel(fromHour)}
        </span>
        <span
          className="ltr absolute start-0 -translate-y-full pe-1.5 text-right text-[0.7rem] tabular-nums text-muted"
          style={{ top: `${gridHeightPx}px`, width: `${GUTTER_PX}px` }}
        >
          {hourLabel(toHour)}
        </span>

        {/* The vertical rule that separates the gutter from the day. */}
        <div
          className="absolute inset-y-0 w-px bg-hairline-card"
          style={{ insetInlineStart: `${GUTTER_PX}px` }}
          aria-hidden
        />

        {/* ── Content lane ──────────────────────────────────────────────── */}
        <div
          className="absolute inset-y-0"
          style={{ insetInlineStart: `${GUTTER_PX}px`, insetInlineEnd: `${EDGE_GAP_PX}px` }}
        >
          {peakBands.map((b, i) => (
            <div
              key={`peak-${i}`}
              className="pointer-events-none absolute inset-x-0 bg-[color-mix(in_srgb,var(--gold)_6%,transparent)]"
              style={{ top: `${b.topPx}px`, height: `${b.heightPx}px` }}
              aria-hidden
            >
              <span className="absolute end-1.5 top-1 inline-flex items-center gap-1 rounded-full bg-background/70 px-1 text-[0.58rem] font-medium text-gold-ink">
                <Sparkles size={8} aria-hidden />
                שעות שיא
              </span>
            </div>
          ))}

          {positionedGaps.map(({ gap, topPx, heightPx }) => (
            <GapBand key={gap.id} gap={gap} topPx={topPx} heightPx={heightPx} onSchedule={onScheduleGapTask} />
          ))}

          {placed.map(({ event, topPx, heightPx, column, columns }, i) => (
            <EventBlock
              key={event.id}
              event={event}
              topPx={topPx}
              heightPx={heightPx}
              column={column}
              columns={columns}
              reduce={reduce}
              index={i}
              onDeleteEvent={onDeleteEvent}
              editMode={editMode}
              onShiftEvent={onShiftEvent}
            />
          ))}

          {nowPx !== null && (
            <div
              className="pointer-events-none absolute inset-x-0 z-[4] flex items-center"
              style={{ top: `${nowPx}px` }}
              aria-hidden
            >
              <span className="-ms-1 size-2.5 shrink-0 rounded-full bg-[var(--gold)] ring-2 ring-surface" />
              <span className="h-[2px] flex-1 rounded-full bg-[var(--gold)]" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
