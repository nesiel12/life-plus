import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db/users";
import { peopleRepo } from "@/lib/db/people";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { computeFreeSlots } from "@/lib/calendarFreeSlots";
import { addDaysToDateKey, jerusalemDateTimeToUtc } from "@/lib/commands/timeWindow";
import { getLocalDateKey, getLocalHour } from "@/lib/intelligence/personalDNA/timezone";
import { suggestMeetupLocationType } from "@/lib/family/suggestMeetupLocationType";
import { toPerson } from "@/lib/mappers";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 requests / 5 min
const LOOKAHEAD_DAYS = 3;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;
const MAX_SLOTS = 3;

const requestSchema = z.object({ personId: z.string().trim().min(1) });

interface FreeBusyResponse {
  calendars?: { primary?: { busy?: { start: string; end: string }[] } };
}

// Meeting Coordinator (docs/ATLAS_ARCHITECTURE_VISION.md §13): real, honest
// scope. Atlas only has OAuth access to the *signed-in user's* Google
// Calendar — there is no mechanism for a second person to connect theirs,
// and building one would be a multi-party auth system, not a Today-view
// feature. So this checks the user's own real free time over the next few
// days (the same freeBusy/computeFreeSlots mechanism calendar suggestions
// already uses) and says so plainly — never claims "mutual" availability
// it cannot actually verify. Location is a real, deterministic time-of-day
// category (lib/family/suggestMeetupLocationType.ts), never a fabricated
// real place — no Places/Maps API key exists in this app.
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`meetup:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;
  const { personId } = parsed.data;

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  const people = await peopleRepo.list(user.id);
  const personRow = people.find((p) => p.id === personId);
  if (!personRow) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }
  const person = toPerson(personRow);
  const displayName = person.hebrewName ?? person.name;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({
      available: false,
      personName: displayName,
      slots: [],
      locationSuggestion: null,
      note: "היומן שלך לא מחובר, אז אי אפשר לבדוק זמנים פנויים.",
    });
  }

  const now = new Date();
  const todayKey = getLocalDateKey(now.toISOString());
  const windowStart = jerusalemDateTimeToUtc(todayKey, DAY_START_HOUR, now);
  const lastDayKey = addDaysToDateKey(todayKey, LOOKAHEAD_DAYS);
  const windowEnd = jerusalemDateTimeToUtc(lastDayKey, DAY_END_HOUR, now);

  try {
    const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: (now.getTime() > windowStart.getTime() ? now : windowStart).toISOString(),
        timeMax: windowEnd.toISOString(),
        items: [{ id: "primary" }],
      }),
    });

    if (!freeBusyRes.ok) {
      return NextResponse.json({
        available: false,
        personName: displayName,
        slots: [],
        locationSuggestion: null,
        note: "לא הצלחתי לבדוק את היומן כרגע.",
      });
    }

    const data = (await freeBusyRes.json()) as FreeBusyResponse;
    const busy = data.calendars?.primary?.busy ?? [];

    // Only count each local day's own 09:00-21:00 window as candidate free
    // time — computeFreeSlots over the raw whole span would also offer
    // slots at 2am, which isn't a real meeting suggestion.
    const dayWindows = Array.from({ length: LOOKAHEAD_DAYS + 1 }, (_, i) => {
      const dateKey = addDaysToDateKey(todayKey, i);
      return {
        start: jerusalemDateTimeToUtc(dateKey, DAY_START_HOUR, now),
        end: jerusalemDateTimeToUtc(dateKey, DAY_END_HOUR, now),
      };
    });

    const slots = dayWindows
      .flatMap(({ start, end }) => {
        const from = now.getTime() > start.getTime() ? now : start;
        if (from.getTime() >= end.getTime()) return [];
        return computeFreeSlots(busy, from, end);
      })
      .slice(0, MAX_SLOTS)
      .map((slot) => ({ start: slot.start.toISOString(), end: slot.end.toISOString() }));

    const locationSuggestion =
      slots.length > 0 ? suggestMeetupLocationType(getLocalHour(slots[0].start)) : null;

    return NextResponse.json({
      available: true,
      personName: displayName,
      slots,
      locationSuggestion,
      note: `אלה הזמנים הפנויים שלך — Life Plus לא יכול לבדוק את היומן של ${displayName}, אז זו לא בדיקת זמינות הדדית אמיתית.`,
    });
  } catch {
    return NextResponse.json({
      available: false,
      personName: displayName,
      slots: [],
      locationSuggestion: null,
      note: "לא הצלחתי לבדוק את היומן כרגע.",
    });
  }
}
