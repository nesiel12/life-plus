import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// AI Task Suggestions for the Time & Tasks Space: given the day's real
// events, work shift, and habit-completion state, asks the AI to act as a
// proactive personal assistant and propose 3-5 concrete, small tasks worth
// doing today (an errand made sensible by a nearby event, a quick prep for
// tonight's shift, a quick win). Same auth/rate-limit/structured-output
// shape as every other app/api/ai/* route.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 suggestion runs / 5 min

const MAX_ITEMS = 30; // bounds the prompt, same spirit as daily-recommendations

const eventInputSchema = z.object({
  title: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  is_all_day: z.boolean(),
});

const shiftInputSchema = z.object({
  employer: z.string().optional(),
  startTime: z.string(),
  endTime: z.string(),
});

const habitInputSchema = z.object({
  title: z.string(),
  completedToday: z.boolean(),
});

// Existing open task titles only, so the model doesn't propose a task the
// user has already planned — real grounding data, not the model guessing
// at what's already on the list.
const requestSchema = z.object({
  events: z.array(eventInputSchema).default([]),
  shifts: z.array(shiftInputSchema).default([]),
  habits: z.array(habitInputSchema).default([]),
  existingTasks: z.array(z.string()).default([]),
});

const suggestionSchema = z.object({
  title: z.string().describe("כותרת קצרה וברורה למשימה מוצעת, בעברית"),
  estimated_minutes: z.number().int().positive().describe("זמן משוער בדקות להשלמת המשימה"),
  category: z
    .string()
    .describe("קטגוריה קצרה בעברית שמתארת את סוג המשימה, למשל: סידורים, הכנה, ניצחון מהיר, בית, בריאות"),
});

const responseSchema = z.object({
  suggestions: z.array(suggestionSchema).min(3).max(5),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`suggest-tasks:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  // Resolved from the session, never from the request body.
  const actor = await currentUserActor();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid events/shifts/habits payload." }, { status: 400 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "הצעות משימות מבוססות AI דורשות מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const events = parsed.data.events.slice(0, MAX_ITEMS);
  const shifts = parsed.data.shifts.slice(0, MAX_ITEMS).map((s) => ({
    ...s,
    hoursWorked: Math.round(((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3_600_000) * 10) / 10,
  }));
  const habits = parsed.data.habits.slice(0, MAX_ITEMS);
  const existingTasks = parsed.data.existingTasks.slice(0, MAX_ITEMS);

  try {
    const result = await generateStructuredData({
      actor,
      schema: responseSchema,
      system:
        "אתה עוזר אישי פרואקטיבי שמציע 3-5 משימות קטנות וקונקרטיות שכדאי למשתמש לעשות היום, בהתבסס על היום " +
        "האמיתי שלו: האירועים/הפגישות שלו, משמרת עבודה אם יש (עם hoursWorked מחושב מראש), וההרגלים היומיים " +
        "שלו וסטטוס ההשלמה שלהם היום. חבר בין פריטים אמיתיים ליום — למשל אירוע קרוב שמצדיק סידור בדרך, משמרת " +
        "ארוכה שמצדיקה הכנה מראש (ארוחה, ציוד), הרגל שעדיין לא הושלם היום שכדאי להזכיר, או ניצחון קטן ומהיר " +
        "שקל להשלים. אל תציע משימה שכבר קיימת ברשימת המשימות הפתוחות שסופקה (existingTasks) — אלה כבר מתוכננות. " +
        "אל תמציא פרטים אישיים שלא סופקו. לכל הצעה קבע estimated_minutes ריאלי (מספר שלם) וכתוב category קצרה " +
        "בעברית שמתארת את סוג המשימה. ענה בעברית בלבד.",
      prompt: JSON.stringify({ events, shifts, habits, existingTasks }, null, 2),
    });

    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("Task suggestion generation failed:", err);
    return NextResponse.json({ error: "יצירת ההצעות נכשלה. נסה שוב." }, { status: 500 });
  }
}
