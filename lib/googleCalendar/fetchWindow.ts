import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";

// One Google Calendar fetch for an arbitrary [from, to) window.
//
// This exists because /range and /year would otherwise have been the fourth
// and fifth hand-rolled copy of the same fetch-and-map. It is deliberately a
// *new* helper rather than a change to lib/googleCalendar/fetchEvents.ts:
// that one drops all-day events, three routes depend on it doing exactly
// that, and widening it to serve a grid view would quietly change what the
// AI command panel and chat see on the calendar.
//
// All-day events are kept here. A month or year grid that omits them is
// wrong in the most visible way possible — a birthday or a holiday simply
// missing from the day it falls on.

export interface WindowEvent {
  id: string;
  title: string;
  /** ISO instant, or "YYYY-MM-DD" for an all-day event. */
  start: string;
  end: string;
  isAllDay: boolean;
}

interface RawGoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface RawGoogleEventsResponse {
  items?: RawGoogleEvent[];
}

/** Google caps a page at 2500; a year of a busy calendar can approach it. */
const MAX_RESULTS = 2500;

export async function fetchCalendarWindow(
  accessToken: string,
  from: Date,
  to: Date
): Promise<WindowEvent[]> {
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(from.toISOString())}` +
    `&timeMax=${encodeURIComponent(to.toISOString())}` +
    `&singleEvents=true&orderBy=startTime&maxResults=${MAX_RESULTS}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    // Same enrichment as the sibling routes — Google's own status and body,
    // not a generic message, because "it failed" is unactionable.
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data = (await res.json()) as RawGoogleEventsResponse;
  return (data.items ?? [])
    .filter((item) => (item.start?.dateTime ?? item.start?.date) && (item.end?.dateTime ?? item.end?.date))
    .map((item) => ({
      id: item.id,
      title: sanitizeEventTitle(item.summary),
      start: (item.start?.dateTime ?? item.start?.date) as string,
      end: (item.end?.dateTime ?? item.end?.date) as string,
      isAllDay: !item.start?.dateTime,
    }));
}
