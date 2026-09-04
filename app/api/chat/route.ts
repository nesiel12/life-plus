import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserByEmail } from "@/lib/db/users";
import { transactionsRepo } from "@/lib/db/transactions";
import { tasksRepo } from "@/lib/db/tasks";
import { learningTopicsRepo, learningResourcesRepo } from "@/lib/db/learning";
import { toTransaction, toTask, toLearningTopic, toLearningResource, toPersonalDNA } from "@/lib/mappers";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { encodeBasedOnHeader } from "@/lib/api/basedOnHeader";
import { buildSystemPrompt } from "@/lib/chatSystemPrompt";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";
import {
  classifyRouterDomain,
  groundFinance,
  groundStudy,
  groundTaskDomain,
  type DomainGrounding,
} from "@/lib/ai/agentRouter";
import { formatCalendarReply, resolveCalendarIntent, type BusyEvent } from "@/lib/ai/agents/calendarAgent";
import { buildSnapshot, type AnalyzableTransaction } from "@/lib/finances/analyze";
import { getLocalWallClock } from "@/lib/intelligence/personalDNA/timezone";
import { fetchGoogleCalendarEvents, type GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";

export const runtime = "nodejs";
// Above lib/ai/service.ts's internal timeouts, so the app's own graceful
// fallback fires before the platform aborts the request.
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 messages / 5 min
const MAX_BASED_ON = 3;
const SCHEDULE_CONTEXT_WINDOW_DAYS = 14;
const DEFAULT_TIME_ZONE = "Asia/Jerusalem"; // matches lib/intelligence/personalDNA/timezone.ts's own default

// AI Context Injection (Smart Calendar & Google Calendar Integration): the
// same real events app/calendar/page.tsx displays, formatted as prompt-
// ready text with date+time (not just a date, unlike upcomingEvents'
// existing format) so Atlas can actually reason about *when* — cross-
// referencing against personalDNA's focus hours, for instance — not just
// *that* something is coming up.
function formatScheduledEvent(event: GoogleCalendarEvent): string {
  const start = new Date(event.start);
  const dateLabel = start.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
  const startTime = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(event.end).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${event.title} (${dateLabel}, ${startTime}–${endTime})`;
}

const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(50)
    .optional(),
});

function mockReply(message: string): string {
  return `אני איתך. שמעתי אותך אומר: "${message}". עדיין אין מפתח API מחובר, אז זו תגובה לדוגמה בלבד — אבל ברגע שתחבר את המפתח, אני אתחיל להשתקף אליך באמת מתוך הדפוסים שלך.`;
}

// AI Companion Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): a
// plain text/plain streamed body plus one small header, on every path
// (real reply, mock fallback, and error fallback alike) — so the client
// has exactly one response shape to consume regardless of which path
// produced it, instead of branching on JSON-vs-stream. Header value is
// encoded via lib/api/basedOnHeader.ts (real Hebrew text isn't valid in a
// raw HTTP header) — components/layout/AICompanion.tsx's read site uses
// the matching decode.
function textResponse(text: string, basedOn: string[]): Response {
  return new Response(text, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-atlas-based-on": encodeBasedOnHeader(basedOn),
    },
  });
}

export async function POST(request: NextRequest) {
  // Switched from getServerSession to getToken (same pattern app/api/
  // calendar/suggestions and app/api/commands/interpret already use):
  // chat now needs the real Google access token for calendar context,
  // which getServerSession deliberately never exposes (see lib/auth.ts's
  // session callback).
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`chat:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, chatRequestSchema);
  if (parsed.error) return parsed.error;
  const { message, history = [] } = parsed.data;

  if (!isProviderConfigured()) {
    return textResponse(mockReply(message), []);
  }

  try {
    // The Section AI Router (Sprint 6): classified in parallel with the user
    // lookup below since it only needs the message text, not the DB — this
    // never adds sequential latency to the common case, and a classification
    // failure degrades to "general" (see classifyRouterDomain), which is
    // exactly this route's own pre-Sprint-6 behavior. Only three domains
    // actually change what happens below (finance/tasks/study); "calendar"
    // and "general" both fall through to the same context-grounded persona
    // reply this route always gave — see lib/ai/agentRouter.ts's header for
    // why "calendar" only sometimes shortcuts and "memories" isn't routed
    // here at all.
    const [user, routerDomain] = await Promise.all([getUserByEmail(token.email), classifyRouterDomain(message)]);

    // AI Context Injection (Smart Calendar & Google Calendar Integration,
    // CRITICAL per the founder's own framing): the real schedule, next 14
    // days — silently omitted (not a failure) when there's no Google
    // session, exactly like every other calendar-touching route's honest-
    // fallback contract. A calendar hiccup should degrade the reply's
    // context, never break the chat itself.
    const accessToken = token.error ? undefined : token.accessToken;

    // Run in parallel, not in series. buildAtlasContext treats
    // scheduledEvents as pure pass-through (see its own comment), so it has
    // no real dependency on the Google round trip — awaiting the calendar
    // first and the DB queries second simply added the two latencies
    // together on every single chat turn, which is a direct contributor to
    // the timeouts. Merged below instead.
    const [calendarEvents, baseContext] = await Promise.all([
      (async (): Promise<GoogleCalendarEvent[]> => {
        if (!accessToken) return [];
        try {
          const now = new Date();
          const until = new Date(now.getTime() + SCHEDULE_CONTEXT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
          return await fetchGoogleCalendarEvents(accessToken, now.toISOString(), until.toISOString());
        } catch {
          // Proceed without calendar context — see comment above.
          return [];
        }
      })(),
      user ? buildAtlasContext(user.id, { query: message }) : Promise.resolve(undefined),
    ]);

    const scheduledCalendarEvents = calendarEvents;
    const scheduledEvents = calendarEvents.map(formatScheduledEvent);
    const context = baseContext ? { ...baseContext, scheduledEvents } : undefined;

    // Calendar is the one domain that short-circuits: a scheduling proposal
    // is a structured fact (a time, a conflict, real alternatives), and
    // asking the persona to restate it in words a second time is exactly
    // where a model could quietly swap the date or drop the conflict — see
    // formatCalendarReply's own header. Only attempted when there's a real
    // busy set to check against; with no Google connection there's nothing
    // honest to propose, so this falls through to the general reply below,
    // which still has the room to explain that itself from context.
    if (routerDomain === "calendar" && accessToken && context) {
      const busy: BusyEvent[] = scheduledCalendarEvents.map((e) => ({ start: e.start, end: e.end, title: e.title }));
      const nowIso = new Date().toISOString();
      try {
        const resolved = await resolveCalendarIntent({
          message,
          nowLocal: getLocalWallClock(nowIso, DEFAULT_TIME_ZONE),
          timeZone: DEFAULT_TIME_ZONE,
          busy,
          chronotype: toPersonalDNA(context.personalDNA).chronotype,
        });
        return textResponse(formatCalendarReply(resolved), ["סוכן היומן"]);
      } catch {
        // Falls through to the general reply below — an unresolved
        // scheduling request still deserves *an* answer, just not one that
        // pretends the schedule pipeline is grounding it.
      }
    }

    // finance/tasks/study: real repo data, deterministically summarized
    // (lib/ai/agentRouter.ts), appended to the same persona system prompt
    // the general path already builds — one voice app-wide, facts the model
    // never had to invent. Only user-scoped domains get here; "general" (or
    // "calendar" falling through from above) leaves `grounding` null and the
    // reply is exactly what this route always produced.
    let grounding: DomainGrounding | null = null;
    if (user && (routerDomain === "finance" || routerDomain === "tasks" || routerDomain === "study")) {
      if (routerDomain === "finance") {
        const rows = await transactionsRepo.list(user.id);
        const transactions: AnalyzableTransaction[] = rows
          .map(toTransaction)
          .map((t) => ({ amount: t.amount, type: t.type, category: t.category, date: t.date }));
        grounding = groundFinance(buildSnapshot(transactions));
      } else if (routerDomain === "tasks") {
        const rows = await tasksRepo.list(user.id);
        grounding = await groundTaskDomain(rows.map(toTask), message, new Date());
      } else {
        const [topicRows, resourceRows] = await Promise.all([
          learningTopicsRepo.list(user.id),
          learningResourcesRepo.list(user.id),
        ]);
        grounding = groundStudy(topicRows.map(toLearningTopic), resourceRows.map(toLearningResource));
      }
    }

    const { prompt, topSignals } = buildSystemPrompt(context);
    const basePrompt = grounding ? `${prompt}\n\n${grounding.lines.join("\n")}` : prompt;
    // The routed domain's own real facts are strictly more relevant to cite
    // for this turn than the general proactive engine's picks, so they
    // replace basedOn rather than append to it.
    const basedOn = grounding ? grounding.basedOn : topSignals.slice(0, MAX_BASED_ON).map((signal) => signal.summary);

    const result = streamChatReply({
      system: basePrompt,
      messages: [...history, { role: "user", content: message }],
    });

    return result.toTextStreamResponse({
      headers: { "x-atlas-based-on": encodeBasedOnHeader(basedOn) },
    });
  } catch (err) {
    // Previously a bare `catch {}` — any real failure here (a Google API
    // error, a DB error from buildAtlasContext, anything) silently showed
    // the exact same "no key connected" text as a genuinely missing key,
    // which is what made this class of bug so hard to diagnose from the
    // outside. Logging the real error is a permanent fix, not just a
    // debug aid — the user-facing fallback behavior is unchanged.
    console.error("[chat] Real AI call failed, falling back to mock reply:", err);
    return textResponse(mockReply(message), []);
  }
}
