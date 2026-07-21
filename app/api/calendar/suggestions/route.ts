import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { computeFreeSlots } from "@/lib/calendarFreeSlots";
import { momentCategoryLabel } from "@/lib/lifeAreas";
import { buildIntelligenceSignals, filterSignalsByCategory, rankSignals } from "@/lib/intelligence/core";
import type { SignalCategory } from "@/lib/intelligence/core";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { computeSuggestionConfidence } from "@/lib/suggestionConfidence";
import type { MomentCategory, SuggestedAction } from "@/types";

// Calendar suggestions only enriches rationale text with relationship and
// behavioral-pattern signals — same scope as before this milestone, now
// picked via the shared ranking engine instead of "first in the array"
// (relationshipSignals[0]) / "first match" (.find()), which were really
// the same "what matters most" decision this engine exists to make
// consistently (docs/ATLAS_ARCHITECTURE_VISION.md §9). Ranking itself
// (which life area / which slot gets suggested) is untouched.
const RATIONALE_CATEGORIES: SignalCategory[] = ["relationship", "personalPattern"];

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
  const context = await buildAtlasContext(user.id);
  const { lifeAreas } = context;
  const rationaleSignals = rankSignals(filterSignalsByCategory(buildIntelligenceSignals(context), RATIONALE_CATEGORIES));
  const topRelationshipSignal = rationaleSignals.find((s) => s.category === "relationship");

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

    // Each suggestion becomes a recommendation_event up front, in `pending`
    // status — the write-path half of the feedback loop (docs/ATLAS_
    // ARCHITECTURE_VISION.md §7). Its real id (not a client-random one) is
    // what the client gets back as SuggestedAction.id, so accept/dismiss
    // can later record an outcome against the same row.
    const suggestions: SuggestedAction[] = await Promise.all(
      freeSlots.slice(0, weakestAreas.length).map(async (slot, i) => {
        const area = weakestAreas[i];
        // Relationship Intelligence feeding scheduling, not just chat: a
        // family-category suggestion names the specific person Atlas already
        // knows is overdue for contact, instead of a generic prompt.
        const relationshipNote =
          area.key === "family" && topRelationshipSignal ? ` ${topRelationshipSignal.summary}.` : "";
        // Personal DNA Engine v1's foundation for scheduling (docs/ATLAS_
        // ARCHITECTURE_VISION.md §3/§5): if a confident focus-window pattern
        // exists for this area, surface it in the rationale. Ranking itself
        // (which area/slot gets suggested) is untouched — this only makes the
        // *explanation* smarter, deliberately short of rebuilding scheduling
        // around energy/focus windows yet.
        const areaLabel = momentCategoryLabel(area.key);
        const focusSignal = rationaleSignals.find(
          (s) => s.category === "personalPattern" && s.summary.includes(areaLabel)
        );
        const focusNote = focusSignal ? ` ${focusSignal.summary}` : "";

        const title = ACTION_BY_CATEGORY[area.key];
        const start = slot.start.toISOString();
        const end = slot.end.toISOString();
        const rationale = `זה התחום עם המדד הכי נמוך כרגע (${area.score}%), ומצאתי לו חלון פנוי ביומן.${relationshipNote}${focusNote}`;
        const confidence = computeSuggestionConfidence(
          area.score,
          lifeAreas.map((a) => a.score)
        );

        const id = await createRecommendationEvent(user.id, {
          type: "calendar_suggestion",
          source: "calendar_suggestions_route",
          payload: { title, category: area.key, start, end, rationale, areaScore: area.score, confidence },
        });

        return { id, title, category: area.key, start, end, rationale, confidence };
      })
    );

    return NextResponse.json({ connected: true, suggestions });
  } catch {
    return NextResponse.json({ connected: true, suggestions: [] });
  }
}
