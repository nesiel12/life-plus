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
  /**
   * Which Google calendar this event lives on. Deleting an event requires the
   * calendar it belongs to — targeting `primary` for an event that actually
   * sits on a secondary calendar returns 404, so this has to travel with the
   * event all the way to the delete call.
   */
  calendarId: string;
  /** False for a subscribed/shared calendar the user can only read. */
  canEdit: boolean;
}

interface RawGoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

interface RawGoogleEventsResponse {
  items?: RawGoogleEvent[];
  nextPageToken?: string;
}

interface RawCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  deleted?: boolean;
  accessRole?: string;
}

interface RawCalendarListResponse {
  items?: RawCalendarListEntry[];
  nextPageToken?: string;
}

export interface CalendarSource {
  id: string;
  title: string;
  primary: boolean;
  /** owner/writer → the user may create and delete events here. */
  canEdit: boolean;
}

/** Google caps a page at 2500; a year of a busy calendar can approach it. */
const MAX_RESULTS = 2500;

/**
 * Hard stop on pagination. Without one, a pathological calendar (or a bug in
 * Google's token handling) would loop until the request times out. Ten pages
 * of 2500 is 25,000 events in one window — far past anything a human grid
 * needs to render.
 */
const MAX_PAGES = 10;

/**
 * Fanning out across every calendar multiplies the request count by the number
 * of calendars. Most people have a handful; a few have dozens of subscribed
 * holiday/sports feeds. Cap the fan-out so one unusual account can't turn a
 * grid render into fifty upstream calls.
 */
const MAX_CALENDARS = 12;

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    // Same enrichment as the sibling routes — Google's own status and body,
    // not a generic message, because "it failed" is unactionable.
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar request failed: ${res.status} ${res.statusText} — ${body}`);
  }
  return (await res.json()) as T;
}

/**
 * Every calendar the user has in their list, newest-consent permitting.
 *
 * `calendarList.list` needs a calendarlist scope, which older grants for this
 * app did not request (lib/auth.ts asked only for `calendar.events`). A user
 * who hasn't re-consented since gets a 403 here — so this degrades to the
 * primary calendar alone rather than failing the whole read. That is the
 * pre-existing behaviour, not a regression, and it self-heals on next sign-in.
 */
export async function listCalendarSources(accessToken: string): Promise<CalendarSource[]> {
  const primaryOnly: CalendarSource[] = [
    { id: "primary", title: "היומן הראשי", primary: true, canEdit: true },
  ];

  try {
    const sources: CalendarSource[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
      const data = await googleJson<RawCalendarListResponse>(url, accessToken);

      for (const item of data.items ?? []) {
        if (item.deleted) continue;
        // `selected` is the user's own "show this calendar" checkbox in
        // Google Calendar. Honouring it means our grid shows what theirs
        // shows, instead of resurrecting feeds they deliberately hid.
        if (item.selected === false && !item.primary) continue;
        sources.push({
          id: item.id,
          title: item.summary ?? item.id,
          primary: Boolean(item.primary),
          canEdit: item.accessRole === "owner" || item.accessRole === "writer",
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    if (sources.length === 0) return primaryOnly;
    // Primary first, then the rest in Google's own order, capped.
    sources.sort((a, b) => Number(b.primary) - Number(a.primary));
    return sources.slice(0, MAX_CALENDARS);
  } catch {
    return primaryOnly;
  }
}

/**
 * Every event in [from, to) on one calendar, following `nextPageToken` to the
 * end. Previously this took only the first page: a window holding more than
 * 2500 events silently lost the remainder, and the caller had no way to know.
 */
export async function fetchCalendarWindow(
  accessToken: string,
  from: Date,
  to: Date,
  calendarId: string = "primary",
  canEdit: boolean = true
): Promise<WindowEvent[]> {
  const events: WindowEvent[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(from.toISOString())}` +
      `&timeMax=${encodeURIComponent(to.toISOString())}` +
      `&singleEvents=true&orderBy=startTime&maxResults=${MAX_RESULTS}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");

    const data = await googleJson<RawGoogleEventsResponse>(url, accessToken);

    for (const item of data.items ?? []) {
      const start = item.start?.dateTime ?? item.start?.date;
      const end = item.end?.dateTime ?? item.end?.date;
      if (!start || !end) continue;
      events.push({
        id: item.id,
        title: sanitizeEventTitle(item.summary),
        start,
        end,
        isAllDay: !item.start?.dateTime,
        calendarId,
        canEdit,
      });
    }

    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return events;
}

/**
 * The same window across every calendar the user actually has, merged and
 * sorted. This is what "show me all my events" means — the previous
 * primary-only read made a second calendar (work, shared family, a course
 * schedule) simply invisible in the app.
 *
 * One failing calendar must not blank the grid, so each fetch settles
 * independently and failures are skipped.
 */
export async function fetchAllCalendarsWindow(
  accessToken: string,
  from: Date,
  to: Date
): Promise<WindowEvent[]> {
  const sources = await listCalendarSources(accessToken);

  const results = await Promise.allSettled(
    sources.map((source) =>
      fetchCalendarWindow(accessToken, from, to, source.id, source.canEdit)
    )
  );

  // If every single calendar failed, that is a real outage (expired token,
  // revoked grant) and the caller needs to hear about it rather than render
  // an empty calendar as though the user had nothing on.
  if (results.length > 0 && results.every((r) => r.status === "rejected")) {
    const first = results[0];
    throw first.status === "rejected"
      ? first.reason
      : new Error("Google Calendar request failed");
  }

  const merged: WindowEvent[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const event of result.value) {
      // The same event can appear on two calendars (an invite the user also
      // owns). Key on calendar + id so a genuine duplicate collapses but two
      // distinct events that happen to share an id do not.
      const key = `${event.calendarId}:${event.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(event);
    }
  }

  merged.sort((a, b) => a.start.localeCompare(b.start));
  return merged;
}
