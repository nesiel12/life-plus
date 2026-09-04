import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { cached } from "@/lib/api/ttlCache";
import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";
import type { MonthEvent } from "@/lib/calendar/analyzeMonth";

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

interface RawGoogleEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}
interface RawGoogleEventsResponse {
  items?: RawGoogleEvent[];
}

export interface MonthApiEvent extends MonthEvent {
  id: string;
}

/** "YYYY-MM" -> the exact [start, end) instants of that calendar month. */
function monthBounds(month: string): { from: Date; to: Date } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { from: new Date(year, monthIndex, 1, 0, 0, 0, 0), to: new Date(year, monthIndex + 1, 1, 0, 0, 0, 0) };
}

async function fetchMonthEvents(accessToken: string, from: Date, to: Date): Promise<MonthApiEvent[]> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
      from.toISOString()
    )}&timeMax=${encodeURIComponent(to.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=2500`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) {
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
      fetchMonthEvents(accessToken, bounds.from, bounds.to)
    );
    return NextResponse.json({ connected: true, month, events });
  } catch (err) {
    // Same honest contract as /week and /upcoming: a real Google failure is
    // not "connected with an empty month".
    console.error("[calendar/month] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, month, events: [] });
  }
}
