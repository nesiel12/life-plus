import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { isProviderConfigured } from "@/lib/ai";
import { resolveCalendarIntent } from "@/lib/ai/agents/calendarAgent";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, DayPart } from "@/types";

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
export const maxDuration = 30;

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
    const result = await resolveCalendarIntent({ message, nowLocal, timeZone, busy, chronotype });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "סוכן היומן לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
