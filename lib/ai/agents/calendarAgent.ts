import "server-only";
import { z } from "zod";
import { generateStructuredData } from "@/lib/ai";
import { findFocusSlots, hasConflict, type Interval } from "@/lib/calendar/findFocusSlots";
import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";
import { buildRRule, describeRecurrence, type Recurrence } from "@/lib/calendar/recurrence";
import type { ChronotypeSettings } from "@/types";
import type { AiActor } from "@/lib/ai/quota";

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
  recurrence: z
    .object({
      freq: z.enum(["daily", "weekly"]).describe("daily = every day; weekly = specific weekdays"),
      byWeekday: z
        .array(z.number().int().min(0).max(6))
        .optional()
        .describe(
          "For weekly: the weekdays it lands on, Sunday=0 … Saturday=6. " +
            "'כל ערב חוץ משישי שבת' => [0,1,2,3,4]. 'כל יום שני' => [1]."
        ),
      count: z.number().int().min(1).max(365).optional().describe("Stop after N occurrences, if the user said so"),
      until: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Stop on this date (YYYY-MM-DD), if the user gave an end date"),
    })
    .optional()
    .describe("Present ONLY when the user asked for something repeating ('כל יום', 'כל שני ורביעי', 'כל ערב'). Omit for a one-off event."),
});

export type CalendarIntent = z.infer<typeof calendarIntentSchema>;

export const CALENDAR_AGENT_SYSTEM = [
  "אתה סוכן היומן של Life Plus. אתה מקבל בקשה בשפה טבעית בעברית וממיר אותה לאירוע יומן מדויק, כפלט JSON מובנה בלבד.",
  "",
  "כללי פרשנות זמן:",
  "- 'היום' = התאריך של הזמן הנוכחי שנמסר לך. 'מחר' = יום אחריו. 'מחרתיים' = יומיים.",
  "- 'יום שלישי' / 'ביום שלישי' = ההופעה הבאה של אותו יום (אם היום שלישי — השבוע הבא).",
  "- 'בשעה 22:00', 'ב-22:00', 'ב10 בערב', 'ב-3 אחה\"צ' — חלץ שעה מדויקת. שעה קטנה + 'בערב'/'אחה\"צ' => הוסף 12.",
  "- start תמיד בפורמט המדויק YYYY-MM-DDTHH:MM (זמן מקומי, בלי שניות, בלי אזור זמן).",
  "- אם אין משך — 60 דקות.",
  "",
  "כותרת:",
  "- קצרה ותיאורית, בעברית, בלי תאריך/שעה בתוכה. הסר מילות פעולה כמו 'תוסיף'/'קבע'/'ליומן'.",
  "- דוגמה: 'תוסיף בית אברך היום בשעה 22:00' => title='בית אברך'.",
  "- אם באמת אין שום כותרת (למשל 'קבע משהו מחר ב-3') — intent=unclear עם clarification 'איך לקרוא לאירוע?'.",
  "",
  "אירוע חוזר:",
  "- מלא את recurrence רק אם יש חזרתיות מפורשת: 'כל יום', 'כל ערב', 'כל שני ורביעי', 'פעמיים בשבוע'.",
  "- 'כל ערב השבוע חוץ משישי שבת בשעה 20:30' => recurrence={freq:'weekly', byWeekday:[0,1,2,3,4]}, start ביום הקרוב מבין אלה בשעה 20:30, title לפי ההקשר.",
  "- 'כל יום ראשון' => byWeekday:[0]. 'כל יום' => freq:'daily'.",
  "- start הוא ההופעה הראשונה של הסדרה.",
  "",
  "כללי בטיחות:",
  "- אל תמציא פרטים. אם חסר מידע קריטי (שעה, או כותרת) — intent=unclear + שאלה אחת קצרה וקונקרטית ב-clarification (למשל 'באיזו שעה?').",
  "- אתה לא בודק התנגשויות ולא בוחר חלונות פנויים — המערכת עושה זאת אחריך.",
  "- ענה תמיד בעברית.",
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

/**
 * "YYYY-MM-DDTHH:MM" in the user's local wall clock -> Date. Tolerant of the
 * shapes a model actually emits despite the prompt: an optional ":SS", and a
 * trailing "Z" or "+HH:MM" offset which is dropped (the value is always read
 * as local wall time — the model was told the user's local clock).
 */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(
    value.trim()
  );
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface ResolvedCalendarEvent {
  title: string;
  start: string; // ISO
  end: string; // ISO
  durationMinutes: number;
  /** Present for a repeating request. `rrule` is the Google Calendar line. */
  recurrence?: { rrule: string; description: string };
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
  actor: AiActor;
}): Promise<ResolveCalendarIntentResult> {
  const intent = await generateStructuredData({
    actor: params.actor,
    schema: calendarIntentSchema,
    system: CALENDAR_AGENT_SYSTEM,
    prompt: buildCalendarAgentPrompt({
      message: params.message,
      nowLocal: params.nowLocal,
      timeZone: params.timeZone,
      busySummary: summarizeBusyForPrompt(params.busy),
    }),
  });

  if (intent.intent !== "create") {
    return {
      status: "unclear",
      clarification: intent.clarification ?? "לא הבנתי מה לקבוע ביומן. אפשר לנסח שוב עם מה, מתי ובאיזו שעה?",
    };
  }
  if (!intent.title) {
    return { status: "unclear", clarification: intent.clarification ?? "איך לקרוא לאירוע?" };
  }
  if (!intent.start) {
    return { status: "unclear", clarification: intent.clarification ?? "באיזו שעה לקבוע את זה?" };
  }

  const start = parseLocalDateTime(intent.start);
  if (!start) {
    return {
      status: "unclear",
      clarification: "לא הצלחתי לפענח את השעה. אפשר לכתוב תאריך ושעה מפורשים, למשל: מחר ב-14:30?",
    };
  }

  let recurrence: ResolvedCalendarEvent["recurrence"];
  if (intent.recurrence) {
    const rec = intent.recurrence as Recurrence;
    const rrule = buildRRule(rec);
    if (rrule) recurrence = { rrule, description: describeRecurrence(rec) };
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
      ...(recurrence ? { recurrence } : {}),
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
  const when = event.recurrence
    ? `${event.recurrence.description}, ${formatRange(event.start, event.end)} (מתחיל ${formatWhen(event.start)})`
    : `${formatWhen(event.start)}, ${formatRange(event.start, event.end)}`;
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
