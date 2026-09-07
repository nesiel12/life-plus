import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db/users";
import { peopleRepo } from "@/lib/db/people";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { CommandIntentSchema, COMMAND_PERIODS } from "@/lib/commands/types";
import { buildCommandSystemPrompt } from "@/lib/commands/buildCommandPrompt";
import { resolvePersonByName } from "@/lib/commands/resolvePerson";
import { buildCommandTimeWindow } from "@/lib/commands/timeWindow";
import { createRecommendationEvent } from "@/lib/intelligence/recommendations";
import { fetchGoogleCalendarEvents } from "@/lib/googleCalendar/fetchEvents";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { localDayIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { getLocalWallClock } from "@/lib/intelligence/personalDNA/timezone";
import { parseMinute, WEEKDAY_LABELS } from "@/lib/schedule/routine";
import { wallClockToInstant } from "@/lib/commands/wallClock";

export const runtime = "nodejs";
// Above lib/ai/service.ts's internal timeouts, so the app's own graceful
// fallback fires before the platform aborts the request.
export const maxDuration = 60;

const RATE_LIMIT = { limit: 15, windowMs: 5 * 60 * 1000 }; // 15 commands / 5 min

const commandRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
});

const NOT_CONFIGURED_REPLY = "עדיין אין מפתח AI מחובר, אז אי אפשר לפרש פקודות חכמות כרגע.";
const FRIENDLY_ERROR = "לא הצלחתי להבין את הפקודה כרגע. נסה שוב עוד רגע.";

const PERIOD_LABEL: Record<(typeof COMMAND_PERIODS)[number], string> = {
  morning: "הבוקר",
  afternoon: "אחר הצהריים",
  evening: "הערב",
  night: "הלילה",
};

// The AI Command Panel (docs/ATLAS_ARCHITECTURE_VISION.md §12): interprets
// a free-text Hebrew command into one of a small, bounded set of real
// actions, then either tracks a recommendation_event carrying everything
// needed to actually execute it (client confirms, then executes) or — for
// clear_calendar_range specifically — already reads the user's real Google
// Calendar so the proposal names real events, not a guess. This route never
// itself mutates anything except recording the pending recommendation_event
// (the same "propose, never act silently" pattern every other suggestion
// surface in this app already follows) — deletion happens in
// app/api/calendar/events's DELETE handler, only once the user confirms.
export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`commands:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  const parsed = await parseJsonBody(request, commandRequestSchema);
  if (parsed.error) return parsed.error;
  const { message } = parsed.data;

  const user = await getUserByEmail(token.email);
  if (!user) {
    return NextResponse.json({ error: "User record not found for authenticated session" }, { status: 500 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json({ reply: NOT_CONFIGURED_REPLY, proposal: null });
  }

  try {
    // The model cannot resolve "מחר בשמונה" without knowing when now is,
    // and the server's clock is not the user's. Reading their stored zone is
    // what makes every relative time in a spoken command land correctly.
    const dna = await personalDnaRepo.get(user.id).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const now = new Date();

    const result = await generateStructuredData({
      actor,
      schema: CommandIntentSchema,
      system: buildCommandSystemPrompt({
        nowLocal: getLocalWallClock(now.toISOString(), timeZone),
        // Noon of the user's local date, read back in UTC: the only way to
        // get their weekday without the host's own timezone shifting it.
        todayLabel:
          WEEKDAY_LABELS[new Date(`${localDayIn(now, timeZone)}T12:00:00Z`).getUTCDay()],
      }),
      prompt: message,
    });

    if (result.intent === "add_moment" && result.addMoment) {
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_add_moment",
        source: "commands_interpret_route",
        payload: result.addMoment,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "add_moment", recommendationEventId, addMoment: result.addMoment },
      });
    }

    if (result.intent === "add_goal" && result.addGoal) {
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_add_goal",
        source: "commands_interpret_route",
        payload: result.addGoal,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "add_goal", recommendationEventId, addGoal: result.addGoal },
      });
    }

    if (result.intent === "add_task" && result.addTask) {
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_add_task",
        source: "commands_interpret_route",
        payload: result.addTask,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "add_task", recommendationEventId, addTask: result.addTask },
      });
    }

    if (result.intent === "add_calendar_event" && result.addCalendarEvent) {
      // The model speaks wall-clock; Google needs an instant. Converting here
      // rather than client-side keeps the user's stored timezone as the single
      // authority on what "10:00" meant.
      const start = wallClockToInstant(result.addCalendarEvent.start, timeZone);
      const end = wallClockToInstant(result.addCalendarEvent.end, timeZone);
      if (!start || !end || end <= start) {
        return NextResponse.json({
          reply: "לא הצלחתי להבין את השעות. אפשר לנסח שוב עם שעת התחלה וסיום?",
          proposal: null,
        });
      }
      const payload = { title: result.addCalendarEvent.title, start, end };
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_add_calendar_event",
        source: "commands_interpret_route",
        payload,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "add_calendar_event", recommendationEventId, addCalendarEvent: payload },
      });
    }

    if (result.intent === "add_routine_block" && result.addRoutineBlock) {
      const startMinute = parseMinute(result.addRoutineBlock.startTime);
      const endMinute = parseMinute(result.addRoutineBlock.endTime);
      if (startMinute === null || endMinute === null || endMinute <= startMinute) {
        return NextResponse.json({
          reply: "לא הצלחתי להבין את השעות של הבלוק. אפשר לנסח שוב?",
          proposal: null,
        });
      }
      const payload = {
        title: result.addRoutineBlock.title,
        kind: result.addRoutineBlock.kind,
        weekdays: [...new Set(result.addRoutineBlock.weekdays)].sort((a, b) => a - b),
        startMinute,
        endMinute,
      };
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_add_routine_block",
        source: "commands_interpret_route",
        payload,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "add_routine_block", recommendationEventId, addRoutineBlock: payload },
      });
    }

    if (result.intent === "log_check_in" && result.logCheckIn) {
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_log_check_in",
        source: "commands_interpret_route",
        payload: result.logCheckIn,
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: { type: "log_check_in", recommendationEventId, logCheckIn: result.logCheckIn },
      });
    }

    if (result.intent === "log_family_interaction" && result.logFamilyInteraction) {
      const people = await peopleRepo.list(user.id);
      const match = resolvePersonByName(
        people.map((p) => ({ id: p.id, name: p.name, hebrewName: p.hebrew_name ?? undefined })),
        result.logFamilyInteraction.personName
      );
      if (!match) {
        return NextResponse.json({
          reply: `לא מצאתי איש קשר בשם "${result.logFamilyInteraction.personName}" — אפשר להוסיף אותו קודם בלוח המשפחתי.`,
          proposal: null,
        });
      }
      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_family_interaction",
        source: "commands_interpret_route",
        payload: { personId: match.id, note: result.logFamilyInteraction.note ?? null },
      });
      return NextResponse.json({
        reply: result.reply,
        proposal: {
          type: "log_family_interaction",
          recommendationEventId,
          logFamilyInteraction: {
            personId: match.id,
            personName: match.hebrewName ?? match.name,
            note: result.logFamilyInteraction.note,
          },
        },
      });
    }

    if (result.intent === "clear_calendar_range" && result.clearCalendarRange) {
      const accessToken = token.error ? undefined : token.accessToken;
      if (!accessToken) {
        return NextResponse.json({
          reply: "היומן שלך לא מחובר, אז אי אפשר לבדוק אילו אירועים יש לך שם.",
          proposal: null,
        });
      }

      const { period, day } = result.clearCalendarRange;
      const { timeMin, timeMax } = buildCommandTimeWindow(period, day, new Date());

      let events: {
        googleEventId: string;
        calendarId: string;
        title: string;
        start: string;
        end: string;
      }[];
      try {
        const rawEvents = await fetchGoogleCalendarEvents(accessToken, timeMin, timeMax);
        events = rawEvents
          // Now that the read spans every calendar, some results come from
          // subscribed feeds the user cannot write to. Proposing to delete
          // those would produce a confirmation that silently half-fails.
          .filter((event) => event.canEdit)
          .map((event) => ({
            googleEventId: event.id,
            calendarId: event.calendarId,
            title: event.title,
            start: event.start,
            end: event.end,
          }));
      } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
        return NextResponse.json({ reply: FRIENDLY_ERROR, proposal: null });
      }

      const recommendationEventId = await createRecommendationEvent(user.id, {
        type: "command_clear_calendar",
        source: "commands_interpret_route",
        payload: { period, day, events },
      });

      const reply = events.length === 0 ? `בדקתי — אין לך אירועים ${PERIOD_LABEL[period]}, כבר פנוי.` : result.reply;

      return NextResponse.json({
        reply,
        proposal: { type: "clear_calendar_range", recommendationEventId, clearCalendarRange: { period, day, events } },
      });
    }

    return NextResponse.json({ reply: result.reply, proposal: null });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ reply: FRIENDLY_ERROR, proposal: null });
  }
}
