import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { resolveCalendarIntent } from "@/lib/ai/agents/calendarAgent";
import { zonedWallClockToInstant } from "@/lib/calendar/timezone";
import {
  calendarAgentRequestSchema,
  deterministicProposal,
  keepBusy,
  resolveNowLocal,
  toChronotype,
} from "@/lib/calendar/agentRequest";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// CalendarAgent (Sprint 1): natural language in, a *proposed* event out.
//
// This route deliberately does not write. It mirrors the propose-then-confirm
// split that app/api/calendar/events already established: the user sees what
// the agent understood, including any conflict, and a separate explicit call
// creates the event. An agent that both interprets and mutates in one step
// makes a misparse ("next Sunday" -> wrong week) unrecoverable.
//
// The interpretation pipeline lives in lib/ai/agents/calendarAgent.ts; the
// request shape and the deterministic fallback live in lib/calendar/
// agentRequest.ts (unit-tested). This route owns only the HTTP contract:
// auth, rate limit, and wiring those two together.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `calendar-agent:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, calendarAgentRequestSchema);
  if (parsed.error) return parsed.error;

  const { message } = parsed.data;
  const timeZone = parsed.data.timeZone;
  const busy = keepBusy(parsed.data.busy);
  const nowLocal = resolveNowLocal(parsed.data.nowLocal, timeZone);
  const chronotype = toChronotype(parsed.data.chronotype);
  // "tomorrow" for the regex fallback is measured from the same wall clock
  // the AI path anchors on, parsed back to a Date.
  const anchor = zonedWallClockToInstant(nowLocal, timeZone) ?? new Date();

  // No AI provider configured: go straight to the deterministic parser rather
  // than a 503. "פגישה מחר ב-14:30" does not need a language model.
  if (!isProviderConfigured()) {
    const local = deterministicProposal(message, timeZone, busy, anchor);
    if (local) return NextResponse.json(local);
    return NextResponse.json({
      status: "unclear" as const,
      clarification:
        "לא הצלחתי לפענח את הבקשה. אפשר לכתוב מה, מתי ובאיזו שעה — למשל: פגישה מחר ב-14:30.",
    });
  }

  try {
    const result = await resolveCalendarIntent({
      actor,
      message,
      nowLocal,
      timeZone,
      busy,
      chronotype,
    });

    // The model shrugged. Before handing back its clarifying question, see if
    // the deterministic parser can resolve it — a flaky "unclear" on a
    // perfectly explicit "מחר ב-14:30" should not block the user.
    if (result.status === "unclear") {
      const local = deterministicProposal(message, timeZone, busy, anchor);
      if (local) return NextResponse.json(local);
    }

    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // Every model in the failover chain is down. An AI outage should not stop
    // someone putting "מחר פגישה ב-13:00" in their calendar — the local
    // parser returns null unless it finds a real, explicit time, so this
    // never invents an event.
    console.error("[calendar-agent] all models failed, trying local parser:", err);

    const local = deterministicProposal(message, timeZone, busy, anchor);
    if (local) return NextResponse.json(local);

    return NextResponse.json({
      status: "unclear" as const,
      clarification: "שירותי ה-AI עמוסים כרגע. אפשר לנסח עם תאריך ושעה מפורשים, למשל: מחר פגישה ב-13:00",
    });
  }
}
