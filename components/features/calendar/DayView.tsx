"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { VerticalTimeline, type TimelineEvent } from "@/components/features/calendar/VerticalTimeline";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useInsights } from "@/hooks/useInsights";
import { buildCheckInProfile } from "@/lib/checkins/analyze";
import { isSameDay, rangeBounds } from "@/lib/calendar/ranges";
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
  const observedEnergy = useMemo(() => {
    const profile = buildCheckInProfile(checkIns);
    return profile.hasEnoughData
      ? { peakHours: profile.peakHours, lowHours: profile.lowHours }
      : undefined;
  }, [checkIns]);

  const query = `/api/calendar/range?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(
    to.toISOString()
  )}`;
  const { data, loading } = useInsights<RangeResponse>(query, FALLBACK, [query]);

  const events = useMemo(() => data?.events ?? [], [data]);

  // The timeline positions events by clock time, so an all-day event has no
  // honest place on it — it would either pin to midnight or stretch the
  // whole column. They get their own band above instead.
  const timed: TimelineEvent[] = useMemo(
    () =>
      events
        .filter((e) => !e.isAllDay)
        .map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end })),
    [events]
  );
  const allDay = useMemo(() => events.filter((e) => e.isAllDay), [events]);

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
            <span key={event.id} className="rounded-lg bg-gold-soft px-2 py-1 text-xs text-gold-ink">
              {event.title}
            </span>
          ))}
        </div>
      )}

      <VerticalTimeline
        day={anchor}
        // The "now" marker belongs on today and nowhere else — drawing it on
        // an arbitrary day would claim the current time is inside it.
        now={isSameDay(anchor, new Date()) ? new Date() : undefined}
        events={timed}
        chronotype={chronotype}
        observedEnergy={observedEnergy}
      />
    </div>
  );
}
