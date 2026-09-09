import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { invalidatePrefix } from "@/lib/api/ttlCache";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 }; // 30 requests / 5 min

const createEventSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    /** Preferred: wall-clock in `timeZone`. Sent to Google as
     *  `{ dateTime, timeZone }` so the event can't drift by the server's
     *  UTC offset or across a DST boundary. `start`/`end` stay for the
     *  overlap check and are ignored for the write when these are present. */
    startLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
    endLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
    timeZone: z.string().trim().min(1).max(60).optional(),
    /** A single "RRULE:FREQ=…" line for a repeating event. Built server-side
     *  from a structured shape (lib/calendar/recurrence.ts), never free text. */
    recurrence: z
      .string()
      .trim()
      .regex(/^RRULE:[A-Z0-9=;,:+-]+$/)
      .max(300)
      .optional(),
  })
  .refine((v) => !((v.startLocal || v.endLocal || v.timeZone) && !(v.startLocal && v.endLocal && v.timeZone)), {
    message: "startLocal, endLocal and timeZone must be provided together.",
  });

const deleteEventSchema = z.object({
  googleEventId: z.string().trim().min(1),
  /** Which calendar the event lives on. Omitted for events read before
   *  multi-calendar support, which were all necessarily on primary. */
  calendarId: z.string().trim().min(1).max(200).optional(),
});

// Move an existing timed event. The Smart Calendar's Edit Mode shifts an
// event by whole 15-minute steps rather than offering free drag — a step is
// unambiguous on a phone and in RTL, where a drag onto "one row up" is a
// coin toss. Only start/end change; title and recurrence are untouched.
const updateEventSchema = z.object({
  googleEventId: z.string().trim().min(1),
  calendarId: z.string().trim().min(1).max(200).optional(),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

// The read routes cache Google's response for 60s (5min for /year). Any write
// here has to drop those entries immediately, or an event the user just
// created or deleted would keep showing the pre-write calendar for up to a
// minute — which reads as "it didn't work".
//
// Prefix-based, not exact-key: the day and week grids cache under
// `calendar-range:{email}:{fromISO}:{toISO}`, an unbounded set of windows this
// writer cannot enumerate. The previous exact-key version cleared only
// week/upcoming/month for *today's* date, so deleting an event left it on
// screen in the Day and Week views — the two places most likely to be open
// when you delete something.
function invalidateCalendarCaches(email: string): void {
  for (const scope of ["range", "week", "upcoming", "month", "year"]) {
    invalidatePrefix(`calendar-${scope}:${email}`);
  }
}

interface GoogleEventResponse {
  id?: string;
  htmlLink?: string;
  error?: { message?: string };
}

// Writes an "accepted" schedule suggestion into the user's real Google
// Calendar. Previously "accept" only appended to local state — see
// docs/BACKLOG.md — this is the actual write-back.
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-events:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, createEventSchema);
  if (parsed.error) return parsed.error;
  const { title, start, end, startLocal, endLocal, timeZone, recurrence } = parsed.data;

  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return NextResponse.json({ error: "End must be after start." }, { status: 400 });
  }

  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: title,
        start:
          startLocal && timeZone ? { dateTime: `${startLocal}:00`, timeZone } : { dateTime: start },
        end: endLocal && timeZone ? { dateTime: `${endLocal}:00`, timeZone } : { dateTime: end },
        ...(recurrence ? { recurrence: [recurrence] } : {}),
      }),
    });

    const data = (await res.json()) as GoogleEventResponse;

    if (!res.ok || !data.id) {
      return NextResponse.json(
        { error: data.error?.message ?? "Google Calendar rejected the event." },
        { status: 502 }
      );
    }

    invalidateCalendarCaches(token.email);
    return NextResponse.json({ id: data.id, htmlLink: data.htmlLink });
  } catch {
    return NextResponse.json({ error: "Could not reach Google Calendar." }, { status: 502 });
  }
}

// The confirm step of "clear my evening" (AI Command Panel, docs/ATLAS_
// ARCHITECTURE_VISION.md §12) — the client already showed the user the real
// events app/api/commands/interpret found and got an explicit confirmation
// before calling this per event, mirroring the same "propose, then a
// distinct confirm mutates" pattern the POST handler above already
// established for creating an event from an accepted suggestion.
export async function DELETE(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-events-delete:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, deleteEventSchema);
  if (parsed.error) return parsed.error;
  const { googleEventId, calendarId = "primary" } = parsed.data;

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    // Google returns 410 Gone for an already-deleted event — treat that as
    // success too, since the end state ("this event no longer exists") is
    // exactly what was asked for.
    if (!res.ok && res.status !== 410) {
      // 403 on a delete means the grant cannot write to *this* calendar —
      // a subscribed holiday feed, or a shared calendar with reader access.
      // That is a different problem from "Google rejected it", and the user
      // can act on it, so it gets its own message.
      const message =
        res.status === 403
          ? "אין לך הרשאת עריכה ביומן הזה, אז אי אפשר למחוק ממנו אירועים."
          : res.status === 404
            ? "האירוע כבר לא קיים ביומן."
            : "היומן של Google דחה את המחיקה.";
      // A 404 means the end state is already what was asked for, same as 410.
      if (res.status === 404) {
        invalidateCalendarCaches(token.email);
        return NextResponse.json({ deleted: true });
      }
      return NextResponse.json({ error: message }, { status: 502 });
    }

    invalidateCalendarCaches(token.email);
    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Google Calendar." }, { status: 502 });
  }
}


// Edit Mode's hour-shift: PATCH the start/end of one event. Mirrors DELETE's
// auth + calendar-scoping + cache invalidation; a 403 means the calendar is
// read-only for this grant (a subscribed feed), which the user can act on.
export async function PATCH(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-events-patch:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "Google Calendar is not connected." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, updateEventSchema);
  if (parsed.error) return parsed.error;
  const { googleEventId, calendarId = "primary", start, end } = parsed.data;

  if (new Date(end).getTime() <= new Date(start).getTime()) {
    return NextResponse.json({ error: "End must be after start." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ start: { dateTime: start }, end: { dateTime: end } }),
      }
    );

    if (!res.ok) {
      const message =
        res.status === 403
          ? "אין לך הרשאת עריכה ביומן הזה, אז אי אפשר להזיז ממנו אירועים."
          : res.status === 404
            ? "האירוע כבר לא קיים ביומן."
            : "היומן של Google דחה את השינוי.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    invalidateCalendarCaches(token.email);
    const data = (await res.json().catch(() => ({}))) as GoogleEventResponse;
    return NextResponse.json({ id: data.id ?? googleEventId, updated: true });
  } catch {
    return NextResponse.json({ error: "Could not reach Google Calendar." }, { status: 502 });
  }
}
