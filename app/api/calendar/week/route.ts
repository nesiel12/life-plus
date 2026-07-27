import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
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

interface RawGoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
interface RawGoogleEventsResponse {
  items?: RawGoogleEvent[];
}

async function fetchWeekEvents(accessToken: string, timeMin: string, timeMax: string): Promise<WeekCalendarEvent[]> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      timeMin
    )}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
    // TEMPORARY: same enrichment as lib/googleCalendar/fetchEvents.ts —
    // surface Google's actual status/body instead of a generic message.
    const body = await res.text().catch(() => "");
    throw new Error(`Google Calendar request failed: ${res.status} ${res.statusText} — ${body}`);
  }

  const data = (await res.json()) as RawGoogleEventsResponse;
  return (data.items ?? [])
    .filter((item) => (item.start?.dateTime ?? item.start?.date) && (item.end?.dateTime ?? item.end?.date))
    .map((item) => ({
      id: item.id,
      title: item.summary ?? "(ללא כותרת)",
      start_time: (item.start?.dateTime ?? item.start?.date) as string,
      end_time: (item.end?.dateTime ?? item.end?.date) as string,
      is_all_day: !item.start?.dateTime,
    }));
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-week:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // TEMPORARY debug logging (Smart Calendar empty-screen investigation) —
  // remove once real events are confirmed flowing end to end. Never logs
  // the token value itself, only its presence/shape.
  console.log(
    `[calendar-debug] /api/calendar/week user=${token.email} tokenError=${token.error ?? "none"} hasAccessToken=${Boolean(token.accessToken)}`
  );

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    console.log(`[calendar-debug] /api/calendar/week user=${token.email} -> not connected (no usable access token)`);
    return NextResponse.json({ connected: false, events: [] });
  }

  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const events = await fetchWeekEvents(accessToken, now.toISOString(), until.toISOString());
    console.log(`[calendar-debug] /api/calendar/week user=${token.email} -> fetched ${events.length} event(s)`);
    return NextResponse.json({ connected: true, events });
  } catch (err) {
    // Same reasoning as /api/calendar/upcoming: a real Google API failure
    // is not "connected with a genuinely empty week" — treat it as not
    // connected so the frontend can offer to reconnect.
    console.error(`[calendar-debug] /api/calendar/week user=${token.email} -> Google Calendar fetch failed:`, err);
    return NextResponse.json({ connected: false, events: [] });
  }
}
