import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { cached } from "@/lib/api/ttlCache";
import { fetchAllCalendarsWindow } from "@/lib/googleCalendar/fetchWindow";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";

// Google Calendar events for the Time & Tasks unified timeline
// (app/areas/time) — a 7-day window that INCLUDES all-day events. This is
// deliberately a separate route from app/api/calendar/upcoming (Smart
// Calendar's existing 14-day, dateTime-only feed) rather than a shared
// helper change: lib/googleCalendar/fetchEvents.ts's fetchGoogleCalendarEvents
// filters all-day events out on purpose for its 3 existing consumers
// (Smart Calendar, the AI command panel's clear_calendar_range, and chat
// context injection), and this UI specifically needs is_all_day items for
// its "Anytime" block. Same getToken/accessToken/"connected" contract as
// every other calendar route, so the frontend can tell "not connected"
// from "connected but empty" honestly.

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min
const WINDOW_DAYS = 7;
// A week of calendar events does not meaningfully change second to second,
// and this route is hit on every mount of the dashboard, the Smart Calendar
// and Time & Tasks. 60s removes the repeat Google round trip that made
// navigating between them feel slow, while staying fresh enough that an
// event added elsewhere shows up promptly.
const CACHE_TTL_MS = 60_000;

// Reshapes the shared window fetch into the snake_case row shape
// buildDailyTimeline consumes alongside real DB rows. This used to be a
// hand-rolled events.list call, which meant the unified timeline quietly
// missed both paginated results and every non-primary calendar.
async function fetchWeekEvents(
  accessToken: string,
  from: Date,
  to: Date
): Promise<WeekCalendarEvent[]> {
  const events = await fetchAllCalendarsWindow(accessToken, from, to);
  return events.map((event) => ({
    id: event.id,
    title: event.title,
    start_time: event.start,
    end_time: event.end,
    is_all_day: event.isAllDay,
  }));
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-week:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, events: [] });
  }

  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    // Keyed by user and by day so the window rolls over correctly at
    // midnight instead of serving yesterday's 7 days from cache.
    const events = await cached(
      `calendar-week:${token.email}:${now.toISOString().slice(0, 10)}`,
      CACHE_TTL_MS,
      () => fetchWeekEvents(accessToken, now, until)
    );
    return NextResponse.json({ connected: true, events });
  } catch (err) {
    // Same reasoning as /api/calendar/upcoming: a real Google API failure
    // is not "connected with a genuinely empty week" — treat it as not
    // connected so the frontend can offer to reconnect.
    console.error("[calendar/week] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, events: [] });
  }
}
