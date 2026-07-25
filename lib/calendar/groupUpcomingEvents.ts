import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";
import { addDaysToDateKey } from "@/lib/commands/timeWindow";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";

export interface UpcomingEventGroup {
  label: string;
  events: GoogleCalendarEvent[];
}

const TODAY_LABEL = "היום";
const TOMORROW_LABEL = "מחר";
const UPCOMING_LABEL = "בקרוב";

// Buckets real Google Calendar events into three groups by real local
// calendar day (Asia/Jerusalem, matching every other date-bucketing
// function in this app via getLocalDateKey) — Today / Tomorrow / Upcoming,
// per the Smart Calendar page's explicit grouping requirement, rather than
// one flat list. Reuses addDaysToDateKey (lib/commands/timeWindow.ts) for
// "tomorrow" instead of a second day-arithmetic implementation. Assumes
// events arrive already sorted by start time (Google's own
// orderBy=startTime, preserved by fetchGoogleCalendarEvents) — order
// within each bucket follows from that, not re-sorted here. Empty buckets
// are dropped, and the three groups always render in a fixed Today ->
// Tomorrow -> Upcoming order regardless of which ones have events.
export function groupUpcomingEvents(events: GoogleCalendarEvent[], now: Date): UpcomingEventGroup[] {
  const todayKey = getLocalDateKey(now.toISOString());
  const tomorrowKey = addDaysToDateKey(todayKey, 1);

  const byLabel = new Map<string, GoogleCalendarEvent[]>();
  for (const event of events) {
    const eventKey = getLocalDateKey(event.start);
    const label = eventKey === todayKey ? TODAY_LABEL : eventKey === tomorrowKey ? TOMORROW_LABEL : UPCOMING_LABEL;
    const bucket = byLabel.get(label) ?? [];
    bucket.push(event);
    byLabel.set(label, bucket);
  }

  return [TODAY_LABEL, TOMORROW_LABEL, UPCOMING_LABEL]
    .map((label) => ({ label, events: byLabel.get(label) ?? [] }))
    .filter((group) => group.events.length > 0);
}
