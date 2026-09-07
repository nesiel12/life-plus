import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { cached } from "@/lib/api/ttlCache";
import { fetchAllCalendarsWindow, type WindowEvent } from "@/lib/googleCalendar/fetchWindow";

// A whole calendar month of events, for the Smart Calendar's month view and
// its time/lifestyle analysis.
//
// Separate from /week and /upcoming for the same reason those are separate
// from each other: a different window and a different inclusion rule. This
// one keeps all-day events (the month grid shows them) and spans an exact
// calendar month rather than a rolling window, so the analysis can honestly
// say "this month" rather than "the last 30 days".
//
// The analysis itself is computed on the client from this data
// (lib/calendar/analyzeMonth.ts) — it's pure arithmetic over events the
// client already has, so shipping it through the server would just add a
// round trip.

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const CACHE_TTL_MS = 60_000;

/**
 * The month grid renders the same shape every other calendar view does.
 * This used to be a fourth hand-rolled copy of the events.list fetch-and-map,
 * which meant it silently missed two things the shared wrapper handles:
 * events past the first page, and every calendar other than primary.
 */
export type MonthApiEvent = WindowEvent;

/** "YYYY-MM" -> the exact [start, end) instants of that calendar month. */
function monthBounds(month: string): { from: Date; to: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { from: new Date(year, monthIndex, 1, 0, 0, 0, 0), to: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0) };
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-month:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const requested = request.nextUrl.searchParams.get("month");
  const now = new Date();
  const month = requested ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const bounds = monthBounds(month);
  if (!bounds) {
    return NextResponse.json({ error: "Invalid month, expected YYYY-MM." }, { status: 400 });
  }

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, month, events: [] });
  }

  try {
    const events = await cached(`calendar-month:${token.email}:${month}`, CACHE_TTL_MS, () =>
      fetchAllCalendarsWindow(accessToken, bounds.from, bounds.to)
    );
    return NextResponse.json({ connected: true, month, events });
  } catch (err) {
    // Same honest contract as /week and /upcoming: a real Google failure is
    // not "connected with an empty month".
    console.error("[calendar/month] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, month, events: [] });
  }
}
