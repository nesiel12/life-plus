import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { cached } from "@/lib/api/ttlCache";
import { fetchCalendarWindow, type WindowEvent } from "@/lib/googleCalendar/fetchWindow";

// Events in an arbitrary window, for the calendar's navigable Day and Week
// views.
//
// The existing /week route cannot serve these: it is hardcoded to `now` plus
// seven days, so it can only ever answer "this coming week" — which is why
// the calendar had no way to look at any day but today. Rather than add a
// parameter to a route the Time space already depends on for its own rolling
// window, this one takes the window explicitly and leaves that contract
// alone.

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 40, windowMs: 5 * 60 * 1000 };

// Same 60s window as every sibling calendar route, and the same reasoning:
// long enough that paging back and forth through days is instant, short
// enough that an event added elsewhere appears promptly.
const CACHE_TTL_MS = 60_000;

/** A window wider than this is a mistake, not a request. */
const MAX_WINDOW_DAYS = 400;

export interface RangeResponse {
  connected: boolean;
  from: string;
  to: string;
  events: WindowEvent[];
}

export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-range:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : null;
  const to = toParam ? new Date(toParam) : null;

  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "from and to must be ISO instants." }, { status: 400 });
  }
  if (to <= from) {
    return NextResponse.json({ error: "to must be after from." }, { status: 400 });
  }
  // Guards the upstream quota, not the client: an unbounded window would let
  // one malformed request pull years of a calendar through Google's API.
  if (to.getTime() - from.getTime() > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: `Window may not exceed ${MAX_WINDOW_DAYS} days.` }, { status: 400 });
  }

  const accessToken = token.error ? undefined : token.accessToken;
  const payload = { from: from.toISOString(), to: to.toISOString() };
  if (!accessToken) {
    return NextResponse.json({ connected: false, ...payload, events: [] } satisfies RangeResponse);
  }

  try {
    const events = await cached(
      `calendar-range:${token.email}:${payload.from}:${payload.to}`,
      CACHE_TTL_MS,
      () => fetchCalendarWindow(accessToken, from, to)
    );
    return NextResponse.json({ connected: true, ...payload, events } satisfies RangeResponse);
  } catch (err) {
    // The honest contract every calendar route here shares: a Google failure
    // is reported as "not connected", never as "connected and empty" — an
    // empty day the user knows has meetings in it destroys trust in the view.
    console.error("[calendar/range] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, ...payload, events: [] } satisfies RangeResponse);
  }
}
