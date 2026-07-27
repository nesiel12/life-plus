import "server-only";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
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

// The one place that calls Google Calendar's events.list — previously
// duplicated inline in app/api/commands/interpret's clear_calendar_range
// handler; now also used by app/api/calendar/upcoming (Smart Calendar page)
// and app/api/chat (AI context injection). Three real call sites is what
// justifies extracting this now, not before. All-day events (date, not
// dateTime) are filtered out — same as the original inline version — since
// callers here need real start/end instants, not a bare date.
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    // TEMPORARY: surface Google's actual status/body (401 invalid token,
    // 403 insufficient scope, etc.) instead of a generic message — the
    // caller's catch block logs this, and right now that reason is
    // exactly what's missing to diagnose a real connect failure.
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data = (await res.json()) as RawGoogleEventsResponse;
  return (data.items ?? [])
    .filter((item) => item.start?.dateTime && item.end?.dateTime)
    .map((item) => ({
      id: item.id,
      title: item.summary ?? "(ללא כותרת)",
      start: item.start?.dateTime as string,
      end: item.end?.dateTime as string,
    }));
}
