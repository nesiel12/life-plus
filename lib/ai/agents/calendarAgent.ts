import "server-only";
import { z } from "zod";
import { generateStructuredData } from "@/lib/ai";
import { findFocusSlots, hasConflict, type Interval } from "@/lib/calendar/findFocusSlots";
import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";
import type { ChronotypeSettings } from "@/types";

// The CalendarAgent's own prompt and contract, kept out of the route so the
// persona is versioned as a unit and can be reused (the Sprint 6 agent router
// will dispatch to exactly this module rather than re-describing the agent).
//
// Design decision: the model never does interval arithmetic. It resolves
// natural language into an intended time, and lib/calendar/findFocusSlots does
// conflict detection and alternative-finding deterministically afterwards.
// Asking an LLM "is 14:00-15:00 free given these 9 events" is how you get
// confident double-bookings.

export const calendarIntentSchema = z.object({
  intent: z
    .enum(["create", "unclear"])
    .describe("create when a concrete event is being requested; unclear when the message is ambiguous or not about scheduling"),
  title: z
    .string()
    .trim()
    .max(200)
    .optional()
    .describe("Short Hebrew event title, no date or time inside it"),
  start: z
    .string()
    .optional()
    .describe("Local start as YYYY-MM-DDTHH:MM, resolved against the supplied current time. Omit when intent is unclear."),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional()
    .describe("Duration in minutes. Default to 60 when the user did not say."),
  clarification: z
    .string()
    .optional()
    .describe("When intent is unclear, one short Hebrew question asking for exactly what is missing"),
});

export type CalendarIntent = z.infer<typeof calendarIntentSchema>;

export const CALENDAR_AGENT_SYSTEM = [
  "אתה סוכן היומן של Life Plus. התפקיד שלך הוא להבין בקשות בשפה טבעית בעברית ולהמיר אותן לאירוע יומן מדויק.",
  "",
  "כללים:",
  "- ענה תמיד בעברית טבעית.",
  "- פרש ביטויי זמן יחסיים ('מחר', 'יום ראשון הבא', 'עוד שעתיים') מול הזמן הנוכחי שנמסר לך.",
  "- אם המשתמש לא ציין משך, קבע 60 דקות.",
  "- אם המשתמש לא ציין שעה מפורשת, או שהבקשה עמומה, החזר intent=unclear ושאלה קצרה אחת בלבד ב-clarification.",
  "- הכותרת צריכה להיות קצרה ותיאורית, בלי תאריך ובלי שעה בתוכה.",
  "- אל תמציא פרטים שהמשתמש לא אמר.",
  "- אתה לא בודק התנגשויות ולא בוחר חלונות פנויים. המערכת עושה זאת אחריך.",
].join("\n");

export function buildCalendarAgentPrompt(params: {
  message: string;
  nowLocal: string;
  timeZone: string;
  busySummary: string;
}): string {
  return [
    `הזמן הנוכחי אצל המשתמש: ${params.nowLocal} (${params.timeZone}).`,
    "",
    "אירועים שכבר קיימים ביומן בטווח הקרוב (לידיעה בלבד, לא לבדיקת התנגשויות):",
    params.busySummary || "(אין אירועים)",
    "",
    `בקשת המשתמש: ${params.message}`,
  ].join("\n");
}

export interface ClarificationTurn {
  /** The agent's question. */
  question: string;
  /** What the user answered. */
  answer: string;
}

/**
 * Folds a clarification exchange back into a single request string.
 *
 * The agent is stateless by design (one message in, one resolution out —
 * see resolveCalendarIntent), so answering "מחר ב-3" to "באיזה יום?" has to
 * carry its own context or the agent has no idea what "3" refers to. Rather
 * than give the route a conversation API it doesn't need, the panel replays
 * the thread as one self-contained message. Pure and exported so the
 * composition is testable without an LLM call.
 */
export function buildClarifiedMessage(original: string, turns: ClarificationTurn[]): string {
  if (turns.length === 0) return original;
  return [
    `הבקשה המקורית: ${original}`,
    ...turns.flatMap((turn) => [`שאלת הבהרה: ${turn.question}`, `תשובת המשתמש: ${turn.answer}`]),
    "",
    "על סמך כל מה שנאמר עד כה, קבע את האירוע. אל תשאל שוב על פרט שכבר נענה.",
  ].join("\n");
}

const MAX_BUSY_SUMMARY_LINES = 60;

/**
 * Real busy intervals, rendered as the Hebrew lines the prompt above expects
 * — extracted from app/api/ai/calendar-agent/route.ts (Sprint 1) alongside
 * resolveCalendarIntent below, for the same reason: one formatting of "what's
 * already on the calendar" that every caller shares, not a second copy that
 * could quietly render busy time differently.
 */
export function summarizeBusyForPrompt(busy: { start: string; end: string; title?: string }[]): string {
  return busy
    .slice(0, MAX_BUSY_SUMMARY_LINES)
    .map((b) => {
      const start = new Date(b.start);
      const end = new Date(b.end);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
      const day = start.toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" });
      const from = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      const to = end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
      return `- ${day} ${from}-${to}${b.title ? `: ${b.title}` : ""}`;
    })
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** "YYYY-MM-DDTHH:MM" in the user's local wall clock -> Date. */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface ResolvedCalendarEvent {
  title: string;
  start: string; // ISO
  end: string; // ISO
  durationMinutes: number;
}

export type ResolveCalendarIntentResult =
  | { status: "unclear"; clarification: string }
  | { status: "proposed"; event: ResolvedCalendarEvent; conflict: boolean; alternatives: ReturnType<typeof findFocusSlots> };

const DEFAULT_DURATION_MINUTES = 60;

/**
 * Classify + resolve, one call: natural language in, a *proposed* event out
 * (never created — see the module header). Extracted from app/api/ai/
 * calendar-agent/route.ts (Sprint 1) so a second caller — the Section AI
 * Router (Sprint 6: a scheduling request typed into the main chat rather
 * than the dedicated Calendar page) — resolves a request through the exact
 * same tested pipeline instead of a parallel, potentially-diverging copy.
 * The route still owns the HTTP contract (rate limiting, auth, the JSON
 * shape it returns); this owns the actual interpretation.
 */
export type BusyEvent = Interval & { title?: string };

export async function resolveCalendarIntent(params: {
  message: string;
  nowLocal: string;
  timeZone: string;
  busy: BusyEvent[];
  chronotype: ChronotypeSettings;
}): Promise<ResolveCalendarIntentResult> {
  const intent = await generateStructuredData({
    schema: calendarIntentSchema,
    system: CALENDAR_AGENT_SYSTEM,
    prompt: buildCalendarAgentPrompt({
      message: params.message,
      nowLocal: params.nowLocal,
      timeZone: params.timeZone,
      busySummary: summarizeBusyForPrompt(params.busy),
    }),
  });

  if (intent.intent !== "create" || !intent.start || !intent.title) {
    return {
      status: "unclear",
      clarification: intent.clarification ?? "לא הצלחתי להבין מתי לקבוע. אפשר לנסח שוב עם תאריך ושעה?",
    };
  }

  const start = parseLocalDateTime(intent.start);
  if (!start) {
    return { status: "unclear", clarification: "לא הצלחתי לפענח את הזמן. אפשר לציין תאריך ושעה מפורשים?" };
  }

  const durationMinutes = intent.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const end = new Date(start.getTime() + durationMinutes * 60_000);

  // Conflict detection is ours, not the model's — see the module header.
  const conflict = hasConflict(start.toISOString(), end.toISOString(), params.busy);
  const alternatives = conflict
    ? findFocusSlots({
        day: start,
        busy: params.busy,
        chronotype: params.chronotype,
        minDurationMinutes: durationMinutes,
        maxResults: 3,
      })
    : [];

  return {
    status: "proposed",
    // Sanitized here, at the boundary where a model-generated string first
    // becomes a real event: this proposal is what the confirm step writes
    // straight into the user's Google Calendar, so a mangled title fixed
    // any later is already too late.
    event: {
      title: sanitizeEventTitle(intent.title),
      start: start.toISOString(),
      end: end.toISOString(),
      durationMinutes,
    },
    conflict,
    alternatives,
  };
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", { weekday: "long", day: "2-digit", month: "2-digit" });
}

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${fmt(start)}–${fmt(end)}`;
}

/**
 * A resolved proposal, narrated deterministically rather than asked of the
 * model a second time — the same reasoning as never asking it to do the
 * interval arithmetic in the first place: a scheduling proposal is a
 * structured fact, and restating it in words is exactly where a model can
 * quietly swap a date or drop a conflict. This never claims the event was
 * created — see the module header, this route never writes.
 */
export function formatCalendarReply(result: ResolveCalendarIntentResult): string {
  if (result.status === "unclear") return result.clarification;

  const { event, conflict, alternatives } = result;
  const when = `${formatWhen(event.start)}, ${formatRange(event.start, event.end)}`;
  const lines = [`אפשר לקבוע "${event.title}" ב-${when}.`];

  if (conflict) {
    lines.push("שים לב: יש לך משהו אחר קבוע באותו זמן.");
    if (alternatives.length > 0) {
      lines.push(
        "כמה זמנים פנויים חלופיים:",
        ...alternatives.map((slot) => `- ${formatWhen(slot.start)}, ${formatRange(slot.start, slot.end)}`)
      );
    }
  }

  lines.push('כדי לקבוע את זה בפועל, עבור ליומן החכם ואשר שם.');
  return lines.join("\n");
}
