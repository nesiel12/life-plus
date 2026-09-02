import { z } from "zod";

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

/** "YYYY-MM-DDTHH:MM" in the user's local wall clock -> Date. */
export function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  const date = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}
