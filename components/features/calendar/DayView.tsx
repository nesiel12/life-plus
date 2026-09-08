"use client";

import { useCallback, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { VerticalTimeline, type TimelineEvent, type TimelineGap } from "@/components/features/calendar/VerticalTimeline";
import {
  DeleteEventButton,
  DeleteEventDialog,
  useEventDeletion,
  type DeletableEvent,
} from "@/components/features/calendar/DeleteEventDialog";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { buildCheckInProfile } from "@/lib/checkins/analyze";
import { isSameDay, rangeBounds } from "@/lib/calendar/ranges";
import { findDayGaps } from "@/lib/calendar/dayGaps";
import { resolveGapActivity, type GapTaskCandidate } from "@/lib/calendar/gapActivity";
import type { WindowEvent } from "@/lib/googleCalendar/fetchWindow";
import type { ChronotypeSettings } from "@/types";

interface DayViewProps {
  /** The day to show. */
  anchor: Date;
  chronotype: ChronotypeSettings;
}

interface RangeResponse {
  connected: boolean;
  events: WindowEvent[];
}

const FALLBACK: RangeResponse = { connected: false, events: [] };

// The grid's resting window. Widened by the day's own events, so an early
// flight or a night shift still shows without every ordinary day paying for
// the empty hours.
const BASE_FROM_HOUR = 7;
const BASE_TO_HOUR = 23;

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

// A single day, hour by hour.
//
// Fetches its own day rather than filtering the page's 14-day upcoming feed.
// That feed is why the day view could only ever show today: it is a rolling
// window from now, so yesterday is not in it and neither is anything past a
// fortnight. Asking for the day being viewed is the only way navigation can
// be honest about days outside that window.
export function DayView({ anchor, chronotype }: DayViewProps) {
  const { from, to } = useMemo(() => rangeBounds("day", anchor), [anchor]);

  // The declared chronotype says what the user predicted about themselves
  // during onboarding; the check-ins say what has since happened. The
  // timeline paints the second over the first wherever there is enough
  // evidence — otherwise the check-in loop collects data and changes nothing,
  // which is a survey, not a system that learns.
  const checkIns = useAtlasStore((s) => s.checkIns);
  const tasks = useAtlasStore((s) => s.tasks);
  const routineBlocks = useAtlasStore((s) => s.routineBlocks);
  const observedEnergy = useMemo(() => {
    const profile = buildCheckInProfile(checkIns);
    return profile.hasEnoughData
      ? { peakHours: profile.peakHours, lowHours: profile.lowHours }
      : undefined;
  }, [checkIns]);

  const query = `/api/calendar/range?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
    to.toISOString()
  )}`;
  const { data, loading, setData, refresh } = useInsights<RangeResponse>(query, FALLBACK, [query]);

  // Drop the row the moment Google confirms the delete, then revalidate. The
  // server-side TTL cache is invalidated by the write, so the refetch is
  // already authoritative — the optimistic step just removes the ~1s window
  // where a deleted event is still sitting on screen.
  const handleDeleted = useCallback(
    (deleted: DeletableEvent) => {
      setData((current) =>
        current
          ? { ...current, events: current.events.filter((e) => e.id !== deleted.id) }
          : current
      );
      refresh();
    },
    [setData, refresh]
  );

  const deletion = useEventDeletion(handleDeleted);

  const events = useMemo(() => data?.events ?? [], [data]);

  // The timeline positions events by clock time, so an all-day event has no
  // honest place on it — it would either pin to midnight or stretch the
  // whole column. They get their own band above instead.
  const timed: TimelineEvent[] = useMemo(
    () =>
      events
        .filter((e) => !e.isAllDay)
        .map((e) => ({
          id: e.id,
          title: e.title,
          start: e.start,
          end: e.end,
          calendarId: e.calendarId,
          canEdit: e.canEdit,
        })),
    [events]
  );
  const allDay = useMemo(() => events.filter((e) => e.isAllDay), [events]);

  const isToday = isSameDay(anchor, new Date());

  // Widen the grid only for events that fall outside the resting window.
  const { fromHour, toHour } = useMemo(() => {
    let earliest = BASE_FROM_HOUR;
    let latest = BASE_TO_HOUR;
    for (const event of timed) {
      const start = new Date(event.start);
      const end = new Date(event.end);
      if (!Number.isNaN(start.getTime())) earliest = Math.min(earliest, start.getHours());
      if (!Number.isNaN(end.getTime())) {
        latest = Math.max(latest, end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours());
      }
    }
    return { fromHour: Math.max(0, earliest), toHour: Math.min(24, Math.max(latest, earliest + 1)) };
  }, [timed]);

  // Free stretches between the day's events, each resolved to a label (a
  // routine block the user defined, or just "free time") and — when the gap
  // is open and something is actually pressing — a task to drop into it.
  const gaps: TimelineGap[] = useMemo(() => {
    if (timed.length === 0 && routineBlocks.length === 0) return [];
    const now = new Date();
    const nowMinute = isToday ? now.getHours() * 60 + now.getMinutes() : undefined;
    const raw = findDayGaps(
      timed.map((e) => ({ start: e.start, end: e.end })),
      { fromMinute: fromHour * 60, toMinute: toHour * 60, nowMinute, minDurationMinutes: 45 }
    );
    const candidates: GapTaskCandidate[] = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      isHighPriority: t.isHighPriority,
    }));
    const weekday = anchor.getDay();
    const todayKey = toDateKey(anchor);
    // Only the first gap that carries a task suggestion keeps it — one nudge
    // per day view, not a task pinned into every hole.
    let suggestedOnce = false;
    return raw.map((gap, i) => {
      const activity = resolveGapActivity(gap, { blocks: routineBlocks, weekday, tasks: candidates, todayKey });
      const task = !suggestedOnce && activity.task ? activity.task : undefined;
      if (task) suggestedOnce = true;
      return {
        id: `gap-${i}-${gap.startMinute}`,
        startMinute: gap.startMinute,
        endMinute: gap.endMinute,
        durationMinutes: gap.durationMinutes,
        label: activity.label,
        accentVar: activity.accentVar,
        task: task ? { id: task.id, title: task.title } : null,
      };
    });
  }, [timed, routineBlocks, tasks, fromHour, toHour, isToday, anchor]);

  const scheduleGapTask = useCallback(
    async ({
      title,
      startMinute,
      endMinute,
    }: {
      taskId: string;
      title: string;
      startMinute: number;
      endMinute: number;
    }) => {
      const toInstant = (minute: number) => {
        const d = new Date(anchor);
        d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        return d.toISOString();
      };
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, start: toInstant(startMinute), end: toInstant(endMinute) }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "לא הצלחנו להוסיף ליומן.");
      }
      refresh();
    },
    [anchor, refresh]
  );

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען את היום…
      </p>
    );
  }

  if (!data?.connected) {
    return <p className="py-8 text-sm text-muted">היומן לא מחובר, אז אין מה להראות כאן עדיין.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {allDay.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">כל היום</span>
          {allDay.map((event) => (
            <span
              key={event.id}
              className="group flex items-center gap-1 rounded-lg bg-gold-soft px-2 py-1 text-xs text-gold-ink"
            >
              {event.title}
              <DeleteEventButton event={event} onRequest={deletion.request} size="sm" />
            </span>
          ))}
        </div>
      )}

      <VerticalTimeline
        day={anchor}
        // The "now" marker belongs on today and nowhere else — drawing it on
        // an arbitrary day would claim the current time is inside it.
        now={isToday ? new Date() : undefined}
        events={timed}
        gaps={gaps}
        onScheduleGapTask={scheduleGapTask}
        fromHour={fromHour}
        toHour={toHour}
        chronotype={chronotype}
        observedEnergy={observedEnergy}
        onDeleteEvent={deletion.request}
      />

      <DeleteEventDialog
        event={deletion.pending}
        deleting={deletion.deleting}
        error={deletion.error}
        onCancel={deletion.cancel}
        onConfirm={deletion.confirm}
      />
    </div>
  );
}
