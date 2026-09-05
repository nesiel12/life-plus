"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useInsights } from "@/hooks/useInsights";
import { dateKey, isSameDay, rangeBounds, weekDays } from "@/lib/calendar/ranges";
import { layoutDayEvents, minutesIntoDay } from "@/lib/calendar/layoutDayEvents";
import type { WindowEvent } from "@/lib/googleCalendar/fetchWindow";
import { cn } from "@/lib/utils";

interface WeekViewProps {
  /** Any date within the week to show. */
  anchor: Date;
}

interface RangeResponse {
  connected: boolean;
  events: WindowEvent[];
}

const FALLBACK: RangeResponse = { connected: false, events: [] };

const WEEKDAY_INITIALS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

/** The window the grid shows by default; widened to fit outlying events. */
const DEFAULT_FROM_HOUR = 7;
const DEFAULT_TO_HOUR = 23;
const ROW_HEIGHT_REM = 3;

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

// The week grid: seven day columns over a shared hour scale.
//
// Overlapping events are laid out by lib/calendar/layoutDayEvents.ts rather
// than stacked — two meetings at the same hour draw side by side, because a
// grid that hides the second one is worse than no grid.
//
// The hour window adapts to what is actually on the calendar. A fixed
// 07:00–23:00 would silently drop a 06:00 flight or a midnight shift, and
// always rendering all 24 hours would make a normal week mostly empty rows.
export function WeekView({ anchor }: WeekViewProps) {
  const { from, to } = useMemo(() => rangeBounds("week", anchor), [anchor]);
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const query = `/api/calendar/range?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
    to.toISOString()
  )}`;
  const { data, loading } = useInsights<RangeResponse>(query, FALLBACK, [query]);

  const events = useMemo(() => data?.events ?? [], [data]);

  const { timed, allDay } = useMemo(() => {
    const timedByDay = new Map<string, WindowEvent[]>();
    const allDayByDay = new Map<string, WindowEvent[]>();
    for (const event of events) {
      if (event.isAllDay) {
        // An all-day value is a plain date; parsing it as a Date would shift
        // it by a timezone. The key is already in the right shape.
        const key = event.start.slice(0, 10);
        allDayByDay.set(key, [...(allDayByDay.get(key) ?? []), event]);
        continue;
      }
      const key = dateKey(new Date(event.start));
      timedByDay.set(key, [...(timedByDay.get(key) ?? []), event]);
    }
    return { timed: timedByDay, allDay: allDayByDay };
  }, [events]);

  const { fromHour, toHour } = useMemo(() => {
    let earliest = DEFAULT_FROM_HOUR;
    let latest = DEFAULT_TO_HOUR;
    for (const event of events) {
      if (event.isAllDay) continue;
      const start = new Date(event.start);
      const end = new Date(event.end);
      earliest = Math.min(earliest, start.getHours());
      // Round the end up so an event finishing at 23:30 does not get clipped
      // by a grid that stops at 23:00.
      latest = Math.max(latest, end.getMinutes() > 0 ? end.getHours() + 1 : end.getHours());
    }
    return { fromHour: Math.max(0, earliest), toHour: Math.min(24, Math.max(latest, earliest + 1)) };
  }, [events]);

  const hours = useMemo(
    () => Array.from({ length: toHour - fromHour }, (_, i) => fromHour + i),
    [fromHour, toHour]
  );
  const gridHeight = `${hours.length * ROW_HEIGHT_REM}rem`;

  if (loading && !data) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        טוען את השבוע…
      </p>
    );
  }

  if (!data?.connected) {
    return <p className="py-8 text-sm text-muted">היומן לא מחובר, אז אין מה להראות כאן עדיין.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[44rem]">
        {/* Day headers */}
        <div className="flex border-b border-hairline-card pb-2">
          <div className="w-12 shrink-0" aria-hidden />
          {days.map((day) => {
            const today = isSameDay(day, new Date());
            return (
              <div key={dateKey(day)} className="flex-1 px-1 text-center">
                <p className="text-[0.7rem] text-muted">{WEEKDAY_INITIALS[day.getDay()]}</p>
                <p
                  className={cn(
                    "ltr mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-xs tabular-nums",
                    today ? "bg-gold-soft font-semibold text-gold-ink" : "text-foreground"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* All-day band, shown only when the week actually has one — an
            always-present empty strip is pure noise. */}
        {allDay.size > 0 && (
          <div className="flex border-b border-hairline-card py-1.5">
            <div className="w-12 shrink-0 pt-0.5 text-[0.65rem] text-muted">כל היום</div>
            {days.map((day) => (
              <div key={dateKey(day)} className="flex min-w-0 flex-1 flex-col gap-1 px-1">
                {(allDay.get(dateKey(day)) ?? []).map((event) => (
                  <span
                    key={event.id}
                    title={event.title}
                    className="truncate rounded bg-gold-soft px-1.5 py-0.5 text-[0.65rem] text-gold-ink"
                  >
                    {event.title}
                  </span>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Hour grid */}
        <div className="relative flex" style={{ height: gridHeight }}>
          <div className="w-12 shrink-0">
            {hours.map((hour) => (
              <div
                key={hour}
                className="ltr border-t border-hairline-card pt-0.5 text-[0.65rem] tabular-nums text-muted"
                style={{ height: `${ROW_HEIGHT_REM}rem` }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = timed.get(dateKey(day)) ?? [];
            const placed = layoutDayEvents(
              dayEvents,
              (event) => ({
                startMinute: minutesIntoDay(new Date(event.start)),
                endMinute: minutesIntoDay(new Date(event.end)),
              }),
              fromHour * 60,
              toHour * 60
            );

            return (
              <div key={dateKey(day)} className="relative min-w-0 flex-1 border-s border-hairline-card">
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-t border-hairline-card"
                    style={{ height: `${ROW_HEIGHT_REM}rem` }}
                  />
                ))}

                {placed.map(({ event, top, height, column, columns }) => (
                  <div
                    key={event.id}
                    title={`${event.title} · ${clockTime(event.start)}`}
                    className="absolute overflow-hidden rounded-md border border-gold-line bg-surface px-1 py-0.5 text-[0.65rem] leading-tight text-foreground shadow-sm"
                    style={{
                      top: `${top * 100}%`,
                      height: `${height * 100}%`,
                      // Logical insets: in RTL the first column has to sit at
                      // the right edge of its day, not the left.
                      insetInlineStart: `${(column / columns) * 100}%`,
                      inlineSize: `calc(${(1 / columns) * 100}% - 2px)`,
                    }}
                  >
                    <span className="block truncate font-medium">{event.title}</span>
                    <span className="ltr block truncate text-muted">{clockTime(event.start)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
