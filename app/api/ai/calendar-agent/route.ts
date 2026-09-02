import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import {
  CALENDAR_AGENT_SYSTEM,
  buildCalendarAgentPrompt,
  calendarIntentSchema,
  parseLocalDateTime,
} from "@/lib/ai/agents/calendarAgent";
import { findFocusSlots, hasConflict, type Interval } from "@/lib/calendar/findFocusSlots";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, DayPart } from "@/types";

// CalendarAgent (Sprint 1): natural language in, a *proposed* event out.
//
// This route deliberately does not write. It mirrors the propose-then-confirm
// split that app/api/calendar/events already established: the user sees what
// the agent understood, including any conflict, and a separate explicit call
// creates the event. An agent that both interprets and mutates in one step
// makes a misparse ("next Sunday" -> wrong week) unrecoverable.

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_BUSY = 60;
const DEFAULT_DURATION_MINUTES = 60;

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
  const keep = (values: string[] | undefined): DayPart[] | undefined =>
    values?.filter(isDayPart);
  return {
    wakeTime: raw.wakeTime,
    sleepTime: raw.sleepTime,
    peakFocusHours: keep(raw.peakFocusHours),
    lowEnergyHours: keep(raw.lowEnergyHours),
  };
}

function summarizeBusy(busy: { start: string; end: string; title?: string }[]): string {
  return busy
    .slice(0, MAX_BUSY)
    .map((b) => {
      const start = new Date(b.start);
      const end = new Date(b.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const day = start.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" });
      const from = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      const to = end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      return `- ${day} ${from}-${to}${b.title ? `: ${b.title}` : ""}`;
    })
    .filter(Boolean)
    .join("\n");
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

  let intent;
  try {
    intent = await generateStructuredData({
      schema: calendarIntentSchema,
      system: CALENDAR_AGENT_SYSTEM,
      prompt: buildCalendarAgentPrompt({
        message,
        nowLocal,
        timeZone,
        busySummary: summarizeBusy(busy),
      }),
    });
  } catch {
    return NextResponse.json({ error: "סוכן היומן לא זמין כרגע. נסה שוב." }, { status: 502 });
  }

  if (intent.intent !== "create" || !intent.start || !intent.title) {
    return NextResponse.json({
      status: "unclear" as const,
      clarification: intent.clarification ?? "לא הצלחתי להבין מתי לקבוע. אפשר לנסח שוב עם תאריך ושעה?",
    });
  }

  const start = parseLocalDateTime(intent.start);
  if (!start) {
    return NextResponse.json({
      status: "unclear" as const,
      clarification: "לא הצלחתי לפענח את הזמן. אפשר לציין תאריך ושעה מפורשים?",
    });
  }

  const durationMinutes = intent.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // Conflict detection is ours, not the model's — see the module header.
  const busyIntervals: Interval[] = busy.map((b) => ({ start: b.start, end: b.end }));
  const conflict = hasConflict(start.toISOString(), end.toISOString(), busyIntervals);

  const alternatives = conflict
    ? findFocusSlots({
        day: start,
        busy: busyIntervals,
        chronotype,
        minDurationMinutes: durationMinutes,
        maxResults: 3,
      })
    : [];

  return NextResponse.json({
    status: "proposed" as const,
    event: {
      title: intent.title,
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes,
    },
    conflict,
    alternatives,
  });
}
