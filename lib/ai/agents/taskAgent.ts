import { z } from "zod";

// TaskAgent (Sprint 5): the "beyond lists" layer. A task title alone rarely
// says what kind of help it needs, so this is one classifying call rather
// than two separate "research this" / "draft this" buttons the user would
// have to choose between correctly — same reasoning as CalendarAgent
// resolving intent before the route decides what to do with it.
//
// Flat object with a `kind` discriminator and every mode's fields optional,
// not z.discriminatedUnion — matching calendarIntentSchema's precedent
// (lib/ai/agents/calendarAgent.ts). Structured-output providers are far more
// reliable against one flat schema than a true union/oneOf.
//
// Honesty constraint baked into the persona, not left to the model's
// judgment: this agent has no live web access (no search tool is wired to
// generateStructuredData — see lib/ai/service.ts), so a "research" answer is
// general knowledge as of training, never framed as current prices, stock,
// or news. Sending fabricated specifics as if they were freshly looked up
// would be worse than declining to help.

export const taskAssistSchema = z.object({
  kind: z
    .enum(["research", "draft", "unclear"])
    .describe(
      "research: the task is best helped by an orientation/considerations briefing. " +
        "draft: the task is best helped by a ready-to-edit piece of writing (email, message, short doc). " +
        "unclear: the task is a physical/logistical action (e.g. laundry, a doctor's visit) that neither mode meaningfully helps with."
    ),
  overview: z
    .string()
    .optional()
    .describe("research only: 1-2 sentences in Hebrew framing what's actually being decided"),
  considerations: z
    .array(z.string())
    .max(6)
    .optional()
    .describe("research only: 2-6 short Hebrew bullets, the real factors to weigh — not a purchase recommendation"),
  draftSubject: z
    .string()
    .optional()
    .describe("draft only: a short Hebrew subject line, when the draft is an email — omit otherwise"),
  draftBody: z
    .string()
    .optional()
    .describe("draft only: the full Hebrew draft text, ready to edit and send"),
  unclearReason: z
    .string()
    .optional()
    .describe("unclear only: one short, respectful Hebrew sentence explaining why this task doesn't fit either mode"),
});

export type TaskAssist = z.infer<typeof taskAssistSchema>;

export const TASK_AGENT_SYSTEM = [
  "אתה עוזר הביצוע של Life Plus. המשתמש נותן לך משימה מרשימת המשימות שלו, ואתה עוזר לו להתקדם בה בפועל — לא רק לרשום אותה.",
  "",
  "ענה תמיד בעברית טבעית, ישירה, בלי הקדמות מיותרות.",
  "",
  "שני סוגי עזרה בלבד:",
  "- research: כשהמשימה היא החלטה שדורשת שיקול דעת בין אפשרויות (למשל 'לתחקר מחשב נייד חדש', 'לבחור מסגרת חינוכית'). תן סקירה קצרה של הגורמים האמיתיים שכדאי לשקול — לא המלצה על מוצר או מותג ספציפי, ולא מחירים או דגמים עדכניים. אתה עונה מתוך ידע כללי, בלי גישה לאינטרנט בזמן אמת, ואסור לך להעמיד פנים שיש לך מידע עדכני.",
  "- draft: כשהמשימה היא כתיבה בפועל (מייל, הודעה, מכתב קצר). כתוב טיוטה מוכנה לעריכה, בגוף ראשון, בטון שמתאים להקשר שנמסר לך.",
  "- unclear: כשהמשימה היא פעולה פיזית או לוגיסטית שאף אחת מהשתיים לא באמת עוזרת בה (לקפל כביסה, ללכת לרופא). אל תמציא עזרה מלאכותית — תגיד את זה בכנות ובקצרה.",
  "",
  "אל תמציא פרטים שהמשתמש לא מסר, ואל תניח הקשר אישי שלא ניתן לך.",
].join("\n");

export function buildTaskAgentPrompt(params: { title: string; description?: string }): string {
  const lines = [`כותרת המשימה: ${params.title}`];
  if (params.description?.trim()) lines.push(`תיאור נוסף: ${params.description.trim()}`);
  return lines.join("\n");
}
