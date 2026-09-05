import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { cached } from "@/lib/api/ttlCache";
import { fetchCalendarWindow } from "@/lib/googleCalendar/fetchWindow";
import { countEventsByDay } from "@/lib/calendar/yearDensity";

// Per-day event counts for a whole year, for the calendar's year heat grid.
//
// Counts rather than events, and aggregated here rather than on the client:
// a busy year is a couple of thousand events, and the grid draws 365 squares
// whose only input is "how many". Shipping the events themselves would be
// two orders of magnitude more payload for information the view discards.
//
// The aggregation is lib/calendar/yearDensity.ts — pure and tested, so the
// multi-day-event and timezone rules are verified without a Google round
// trip. It runs server-side only because that is where the size saving is.

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

// Longer than the 60s the day and week windows use. A year's shape does not
// meaningfully change minute to minute, and this is the most expensive
// upstream call the calendar makes.
const CACHE_TTL_MS = 5 * 60_000;

/** Beyond this, a request is a typo or a probe, not a year someone is viewing. */
const MIN_YEAR = 1970;
const MAX_YEAR = 2200;

export interface YearResponse {
  connected: boolean;
  year: number;
  /** Local "YYYY-MM-DD" -> event count. Empty days are absent. */
  counts: Record<string, number>;
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-year:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const requested = request.nextUrl.searchParams.get("year");
  const year = requested ? Number(requested) : new Date().getFullYear();
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  const from = new Date(year, 0, 1);
  const to = new Date(year + 1, 0, 1);

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, year, counts: {} } satisfies YearResponse);
  }

  try {
    const counts = await cached(`calendar-year:${token.email}:${year}`, CACHE_TTL_MS, async () => {
      const events = await fetchCalendarWindow(accessToken, from, to);
      return countEventsByDay(events, from, to);
    });
    return NextResponse.json({ connected: true, year, counts } satisfies YearResponse);
  } catch (err) {
    // Same contract as every sibling: a Google failure is "not connected",
    // never an honestly-empty year.
    console.error("[calendar/year] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, year, counts: {} } satisfies YearResponse);
  }
}
