import "server-only";
import { fetchAllCalendarsWindow } from "@/lib/googleCalendar/fetchWindow";

export interface GoogleCalendarEvent {
  id: string;
  title: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  /** The calendar the event lives on — required to delete it. */
  calendarId: string;
  /** False for a subscribed/shared calendar the user can only read. */
  canEdit: boolean;
}

// The one place that calls Google Calendar's events.list — previously
// duplicated inline in app/api/commands/interpret's clear_calendar_range
// handler; now also used by app/api/calendar/upcoming (Smart Calendar page)
// and app/api/chat (AI context injection). All-day events (date, not
// dateTime) are filtered out — same as the original inline version — since
// callers here need real start/end instants, not a bare date.
//
// Now delegates to fetchAllCalendarsWindow rather than hand-rolling the
// request. That fixes two silent omissions this function used to have: it
// took only the first page of results (Google's default cap is 250, so a
// fortnight of a busy calendar could be truncated with no indication), and it
// read only `primary`, so a second work or family calendar was invisible to
// the upcoming feed, to the AI's context, and to "clear my evening".
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleCalendarEvent[]> {
  const events = await fetchAllCalendarsWindow(
    accessToken,
    new Date(timeMin),
    new Date(timeMax)
  );

  return events
    .filter((event) => !event.isAllDay)
    .map((event) => ({
      id: event.id,
      title: event.title,
      start: event.start,
      end: event.end,
      calendarId: event.calendarId,
      canEdit: event.canEdit,
    }));
}
