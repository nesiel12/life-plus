import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { fetchGoogleCalendarEvents } from "@/lib/googleCalendar/fetchEvents";
import { cached } from "@/lib/api/ttlCache";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min
const UPCOMING_WINDOW_DAYS = 14;
// See app/api/calendar/week for the reasoning — same 60s window, same
// invalidation on write (app/api/calendar/events).
const CACHE_TTL_MS = 60_000;

// Smart Calendar (docs/ATLAS_ARCHITECTURE_VISION.md): the user's real
// Google Calendar events for the next two weeks, for display on
// app/calendar/page.tsx. Same getToken/accessToken pattern every other
// calendar-touching route already uses (app/api/calendar/suggestions,
// app/api/commands/interpret) — `connected: false` (not an error) when no
// Google session exists yet, matching calendar/suggestions' own contract,
// so the page can render an honest "connect your calendar" state instead
// of a fabricated empty list.
export async function GET(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar-upcoming:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // TEMPORARY debug logging (Smart Calendar empty-screen investigation) —
  // remove once real events are confirmed flowing end to end. Never logs
  // the token value itself, only its presence/shape.
  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, events: [] });
  }

  const now = new Date();
  const until = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const events = await cached(
      `calendar-upcoming:${token.email}:${now.toISOString().slice(0, 10)}`,
      CACHE_TTL_MS,
      () => fetchGoogleCalendarEvents(accessToken, now.toISOString(), until.toISOString())
    );
    return NextResponse.json({ connected: true, events });
  } catch (err) {
    // A real Google API failure (expired token, a grant that predates a
    // later scope change and never got re-consented, network error, etc.)
    // is NOT "connected with a genuinely empty calendar" — reporting it as
    // connected:true previously masked exactly this kind of problem.
    // Treat any real fetch failure the same as "not connected" so the
    // frontend can offer to reconnect instead of showing a misleadingly
    // clean empty calendar.
    console.error("[calendar/upcoming] Google Calendar fetch failed:", err);
    return NextResponse.json({ connected: false, events: [] });
  }
}
