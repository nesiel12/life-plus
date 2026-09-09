import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { resolveCalendarIntent } from "@/lib/ai/agents/calendarAgent";
import { parseHebrewEvent } from "@/lib/calendar/parseHebrewEvent";
import { zonedWallClockToInstant } from "@/lib/calendar/timezone";
import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";
import { hasConflict, type Interval } from "@/lib/calendar/findFocusSlots";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, DayPart } from "@/types";
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
// The actual interpretation (classify -> resolve -> conflict-check ->
// alternatives) lives in lib/ai/agents/calendarAgent.ts's resolveCalendarIntent
// — this route owns only the HTTP contract (auth, rate limit, request
// validation), so the Section AI Router (Sprint 6: the same kind of request
// typed into the main chat) resolves through the identical tested pipeline
// rather than a second, potentially-diverging copy of it.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_BUSY = 60;

const intervalSchema = z.object({
  start: z.string(),
  end: z.string(),
  title: z.string().optional(),
});

const requestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  /** Client's local wall clock, "YYYY-MM-DDTHH:MM" — the anchor for "tomorrow". */
  nowLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  timeZone: z.string().trim().min(1).max(60).default("Asia/Jerusalem"),
  busy: z.array(intervalSchema).max(MAX_BUSY).default([]),
  chronotype: z
    .object({
      wakeTime: z.string().optional(),
      sleepTime: z.string().optional(),
      peakFocusHours: z.array(z.string()).optional(),
      lowEnergyHours: z.array(z.string()).optional(),
    })
    .default({}),
});

function toChronotype(raw: z.infer<typeof requestSchema>["chronotype"]): ChronotypeSettings {
  const keep = (values: string[] | undefined): DayPart[] | undefined => values?.filter(isDayPart);
  return {
    wakeTime: raw.wakeTime,
    sleepTime: raw.sleepTime,
    peakFocusHours: keep(raw.peakFocusHours),
    lowEnergyHours: keep(raw.lowEnergyHours),
  };
}

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

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "סוכן היומן דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const { message, nowLocal, timeZone, busy } = parsed.data;
  const chronotype = toChronotype(parsed.data.chronotype);

  try {
    const result = await resolveCalendarIntent({
      actor, message, nowLocal, timeZone, busy, chronotype });
    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    // Every model in the failover chain is down. Rather than tell the user
    // the calendar is unavailable, try the deterministic local parser: an AI
    // outage should not stop someone putting "מחר פגישה ב-13:00" in their
    // calendar. It returns null unless it finds a real, explicit time, so
    // this never invents an event — see lib/calendar/parseHebrewEvent.ts.
    console.error("[calendar-agent] all models failed, trying local parser:", err);

    const parsed = parseHebrewEvent(message, new Date());
    if (parsed) {
      // parsed.start is a wall clock — resolve it in the user's zone, never
      // the server's, so the fallback lands at the time they said too.
      const start = zonedWallClockToInstant(parsed.start, timeZone) ?? new Date(`${parsed.start}:00`);
      const end = new Date(start.getTime() + parsed.durationMinutes * 60_000);
      const endLocalMs = start.getTime() + parsed.durationMinutes * 60_000;
      const toWall = (ms: number) => {
        const p = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
        }).formatToParts(new Date(ms));
        const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
        return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
      };
      const intervals: Interval[] = busy.map((b) => ({ start: b.start, end: b.end }));
      return NextResponse.json({
        status: "proposed" as const,
        event: {
          title: sanitizeEventTitle(parsed.title),
          start: start.toISOString(),
          end: end.toISOString(),
          startLocal: toWall(start.getTime()),
          endLocal: toWall(endLocalMs),
          timeZone,
          durationMinutes: parsed.durationMinutes,
        },
        conflict: hasConflict(start.toISOString(), end.toISOString(), intervals),
        // Alternatives come from ranking free slots, which is fine to skip
        // here — the proposal itself is what matters when the AI is down.
        alternatives: [],
        // So the UI can say the reading was local, not the agent's.
        degraded: true,
      });
    }

    return NextResponse.json({
      status: "unclear" as const,
      clarification: "שירותי ה-AI עמוסים כרגע. אפשר לנסח עם תאריך ושעה מפורשים, למשל: מחר פגישה ב-13:00",
    });
  }
}
