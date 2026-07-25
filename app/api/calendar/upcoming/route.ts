import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { fetchGoogleCalendarEvents } from "@/lib/googleCalendar/fetchEvents";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min
const UPCOMING_WINDOW_DAYS = 14;

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

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, events: [] });
  }

  const now = new Date();
  const until = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const events = await fetchGoogleCalendarEvents(accessToken, now.toISOString(), until.toISOString());
    return NextResponse.json({ connected: true, events });
  } catch {
    return NextResponse.json({ connected: true, events: [] });
  }
}
