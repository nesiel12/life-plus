import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { invalidatePrefix } from "@/lib/api/ttlCache";
import { fetchGoogleCalendarEvents } from "@/lib/googleCalendar/fetchEvents";
import { rangeBounds } from "@/lib/calendar/ranges";

// Bulk-clear a window of the user's real Google Calendar — the "ניקוי יומן"
// action in the Smart Calendar header. Two-step by construction: the client
// shows a confirmation naming the scope and the count before it ever calls
// this, and this only ever touches events the grant can actually write to
// (canEdit) — a subscribed holiday feed is left alone rather than half-failing.

export const runtime = "nodejs";
export const maxDuration = 60;

// Destructive and irreversible per event — keep the ceiling low.
const RATE_LIMIT = { limit: 4, windowMs: 10 * 60 * 1000 };

// A year of a busy calendar could be hundreds of events; delete a bounded
// batch per call and report the remainder so a second run finishes the job
// rather than the request timing out mid-delete.
const MAX_DELETES_PER_CALL = 120;

const requestSchema = z.object({
  scope: z.enum(["day", "week", "month", "year"]),
  /** Any instant inside the window to clear. Defaults to now. */
  anchor: z.string().datetime({ offset: true }).optional(),
});

const SCOPE_LABEL: Record<z.infer<typeof requestSchema>["scope"], string> = {
  day: "היום",
  week: "השבוע",
  month: "החודש",
  year: "השנה",
};

function invalidateCalendarCaches(email: string): void {
  for (const scope of ["range", "week", "upcoming", "month", "year"]) {
    invalidatePrefix(`calendar-${scope}:${email}`);
  }
}

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-clear:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "היומן של Google לא מחובר." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const { scope } = parsed.data;
  const anchor = parsed.data.anchor ? new Date(parsed.data.anchor) : new Date();
  const { from, to } = rangeBounds(scope, anchor);

  let deletable: { id: string; calendarId: string }[];
  try {
    const events = await fetchGoogleCalendarEvents(accessToken, from.toISOString(), to.toISOString());
    deletable = events.filter((e) => e.canEdit).map((e) => ({ id: e.id, calendarId: e.calendarId }));
  } catch {
    return NextResponse.json({ error: "לא הצלחנו לקרוא את היומן." }, { status: 502 });
  }

  if (deletable.length === 0) {
    return NextResponse.json({ deleted: 0, failed: 0, remaining: 0, scopeLabel: SCOPE_LABEL[scope] });
  }

  const batch = deletable.slice(0, MAX_DELETES_PER_CALL);
  let deleted = 0;
  let failed = 0;

  // Sequential on purpose: Google rate-limits calendar writes hard, and a
  // burst of parallel deletes trips a 403 that looks like a permissions
  // problem. One at a time is slower but it actually finishes.
  for (const event of batch) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          event.calendarId
        )}/events/${encodeURIComponent(event.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      // 410 Gone / 404 — already deleted; the end state is what was asked for.
      if (res.ok || res.status === 410 || res.status === 404) deleted += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  invalidateCalendarCaches(token.email);

  return NextResponse.json({
    deleted,
    failed,
    remaining: Math.max(0, deletable.length - batch.length),
    scopeLabel: SCOPE_LABEL[scope],
  });
}
