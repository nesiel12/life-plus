import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { computeFreeSlots } from "@/lib/calendarFreeSlots";
import type { MomentCategory, SuggestedAction } from "@/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 requests / 5 min

const ACTION_BY_CATEGORY: Record<MomentCategory, string> = {
  faith: "זמן לימוד תורה",
  family: "זמן איכות עם המשפחה",
  knowledge: "זמן לפרויקט אישי",
  health: "אימון או הליכה",
  career: "התקדמות בפרויקט מקצועי",
  general: "זמן פנוי",
};

const MAX_SUGGESTIONS = 3;

interface FreeBusyResponse {
  calendars?: {
    primary?: {
      busy?: { start: string; end: string }[];
    };
  };
}

export async function POST(request: NextRequest) {
  // getToken reads the JWT directly (cookie/header), independent of the
  // session callback — this is how accessToken stays server-only while still
  // being reachable here. See lib/auth.ts's session callback for why it's
  // deliberately absent from getServerSession's return value.
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`calendar:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ connected: false, suggestions: [] });
  }

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ connected: true, suggestions: [] });
  }

  // Life-area scores now come from the Context Engine (server-authoritative)
  // instead of whatever the client's local store happened to have cached —
  // previously the request body carried them, which meant ranking could run
  // against stale or (in principle) client-supplied values instead of the
  // real thing (docs/BACKLOG.md).
  const { lifeAreas, relationshipSignals } = await buildAtlasContext(user.id);

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(22, 0, 0, 0);

  if (endOfDay.getTime() <= now.getTime()) {
    return NextResponse.json({ connected: true, suggestions: [] });
  }

  try {
    const freeBusyRes = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: now.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: "primary" }],
      }),
    });

    if (!freeBusyRes.ok) {
      return NextResponse.json({ connected: true, suggestions: [] });
    }

    const data = (await freeBusyRes.json()) as FreeBusyResponse;
    const busy = data.calendars?.primary?.busy ?? [];
    const freeSlots = computeFreeSlots(busy, now, endOfDay);

    const weakestAreas = [...lifeAreas].sort((a, b) => a.score - b.score).slice(0, MAX_SUGGESTIONS);

    const suggestions: SuggestedAction[] = freeSlots.slice(0, weakestAreas.length).map((slot, i) => {
      const area = weakestAreas[i];
      // Relationship Intelligence feeding scheduling, not just chat: a
      // family-category suggestion names the specific person Atlas already
      // knows is overdue for contact, instead of a generic prompt.
      const relationshipNote =
        area.key === "family" && relationshipSignals.length > 0 ? ` ${relationshipSignals[0]}.` : "";
      return {
        id: Math.random().toString(36).slice(2, 10),
        title: ACTION_BY_CATEGORY[area.key],
        category: area.key,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        rationale: `זה התחום עם המדד הכי נמוך כרגע (${area.score}%), ומצאתי לו חלון פנוי ביומן.${relationshipNote}`,
      };
    });

    return NextResponse.json({ connected: true, suggestions });
  } catch {
    return NextResponse.json({ connected: true, suggestions: [] });
  }
}
