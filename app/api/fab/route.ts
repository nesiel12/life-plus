import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db/users";
import { peopleRepo } from "@/lib/db/people";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { routeFabInput } from "@/lib/ai/fabRouter";
import { describeFabAction, isSosMessage, type FabRouteResponse } from "@/lib/ai/fabIntents";
import { resolvePersonByName } from "@/lib/commands/resolvePerson";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { getLocalWallClock } from "@/lib/intelligence/personalDNA/timezone";
import { localDayIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { WEEKDAY_LABELS } from "@/lib/schedule/routine";

export const runtime = "nodejs";
// Above lib/ai/service.ts's internal timeouts, so the app's own graceful
// fallback fires before the platform aborts the request.
export const maxDuration = 30;

// Higher than /api/commands/interpret's 15 per 5 minutes: the FAB is for
// quick logs, several in a row ("שתיתי כוס", "שילמתי 12 על קפה") is normal use.
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const fabRequestSchema = z.object({
  // A typed line or a voice transcript — both arrive as text.
  text: z.string().trim().min(1).max(500),
});

const handoff = (reason: Extract<FabRouteResponse, { mode: "handoff" }>["reason"]): FabRouteResponse => ({
  mode: "handoff",
  reason,
});

// The FAB's fast path (lib/ai/fabRouter.ts). Interprets one line into a quick
// log, or hands it back to the pipeline that owns it. It never mutates user
// data: auto-mode results are executed by the client through the ordinary
// store actions (which is what gives each an undo), and confirm-mode results
// only record a pending recommendation_event, exactly as
// /api/commands/interpret does.
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, fabRequestSchema);
  if (parsed.error) return parsed.error;
  const { text } = parsed.data;

  // The SOS path, and it comes first on purpose: after auth (so the endpoint
  // is not an open oracle) but before the rate limiter, the database, the AI
  // actor and the model. A distress message leaves no row, no quota charge
  // and no log line, and is never shown to a third-party model — see
  // isSosMessage for why this is decided locally. Nothing here logs `text`.
  if (isSosMessage(text)) {
    return NextResponse.json({ mode: "sos" } satisfies FabRouteResponse);
  }

  const limited = rateLimitResponse(`fab:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json(handoff("unavailable"));
  }

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  try {
    // "מחר בשמונה" cannot be resolved without knowing when now is *for the
    // user*; the server's clock is UTC.
    const dna = await personalDnaRepo.get(user.id).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const now = new Date();

    const decision = await routeFabInput({
      text,
      actor,
      clock: {
        nowLocal: getLocalWallClock(now.toISOString(), timeZone),
        // Noon of the user's local date read back in UTC: the only way to get
        // their weekday without the host's own timezone shifting it.
        todayLabel: WEEKDAY_LABELS[new Date(`${localDayIn(now, timeZone)}T12:00:00Z`).getUTCDay()],
      },
      findPerson: async (spokenName) => {
        const people = await peopleRepo.list(user.id);
        return resolvePersonByName(
          people.map((p) => ({ id: p.id, name: p.name, hebrewName: p.hebrew_name ?? undefined })),
          spokenName
        );
      },
    });

    switch (decision.kind) {
      case "sos":
        return NextResponse.json({ mode: "sos" } satisfies FabRouteResponse);
      case "auto":
        return NextResponse.json({
          mode: "auto",
          action: decision.action,
          summary: describeFabAction(decision.action),
        } satisfies FabRouteResponse);
      case "confirm": {
        const recommendationEventId = await createRecommendationEvent(user.id, {
          type: `fab_${decision.action.intent.toLowerCase()}`,
          source: "fab_route",
          payload: decision.action.payload,
        });
        return NextResponse.json({
          mode: "confirm",
          action: decision.action,
          summary: describeFabAction(decision.action),
          recommendationEventId,
        } satisfies FabRouteResponse);
      }
      case "reply":
        return NextResponse.json({ mode: "reply", reply: decision.reply } satisfies FabRouteResponse);
      case "handoff":
        return NextResponse.json(handoff(decision.reason));
    }
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // Not a reason to lose the user's input: the client falls through to the
    // command pipeline / chat with the same text.
    return NextResponse.json(handoff("unavailable"));
  }
}
