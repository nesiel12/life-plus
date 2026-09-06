import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Daily AI Recommendations for the Time & Tasks unified timeline: given a
// day's real events + open tasks, asks the AI for 1-2 concrete, actionable
// nudges (a breather between back-to-back meetings, moving an undated
// task, blocking time for something that matters). Same auth/rate-limit/
// structured-output shape as every other AI route in this app.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 analyses / 5 min

const MAX_ITEMS = 30; // bounds the prompt; a single day's load is never realistically bigger than this

const eventInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  is_all_day: z.boolean(),
});

const taskInputSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.string(),
});

// Finances Pro: Work & Shifts — a work shift for this date, if any.
// hoursWorked is computed here (not left for the model to derive from
// raw ISO timestamps), so "a 10-hour shift" is a real number the AI is
// reasoning over, not something it has to calculate itself.
const shiftInputSchema = z.object({
  employer: z.string().optional(),
  hourlyRate: z.number().optional(),
  startTime: z.string(),
  endTime: z.string(),
});

// `context` is a loose bag of unknown keys, same as /api/ai/prioritize-tasks
// — the frontend sends real, live data from useAtlasStore (personalDNA,
// real upcoming events), never a fixed or invented personal narrative.
const requestSchema = z.object({
  events: z.array(eventInputSchema).default([]),
  tasks: z.array(taskInputSchema).default([]),
  shifts: z.array(shiftInputSchema).default([]),
  context: z.record(z.string(), z.unknown()).optional().default({}),
});

const recommendationSchema = z.object({
  title: z.string().describe("כותרת קצרה וקונקרטית להמלצה, בעברית"),
  message: z.string().describe("משפט או שניים שמסבירים את הפעולה המוצעת, מתייחסים לפריטים האמיתיים מהיום"),
  icon_name: z.enum(["coffee", "heart", "alert-circle", "calendar-clock"]).describe("הסמל המתאים ביותר להמלצה"),
});

const responseSchema = z.object({
  recommendations: z.array(recommendationSchema).min(1).max(2),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`daily-recommendations:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
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
    return NextResponse.json({ error: "Invalid events/tasks payload." }, { status: 400 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "ניתוח AI דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  const events = parsed.data.events.slice(0, MAX_ITEMS);
  const tasks = parsed.data.tasks.slice(0, MAX_ITEMS);
  const { context } = parsed.data;

  const shifts = parsed.data.shifts.slice(0, MAX_ITEMS).map((s) => ({
    ...s,
    hoursWorked: Math.round(((new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) / 3_600_000) * 10) / 10,
  }));

  try {
    const result = await generateStructuredData({
      actor,
      schema: responseSchema,
      system:
        "אתה עוזר Life OS פרואקטיבי שמנתח את העומס של המשתמש ליום מסוים — האירועים והמשימות הפתוחות שלו, " +
        "משמרות עבודה (shifts, אם יש) עם hoursWorked המחושב מראש, וההקשר האישי האמיתי שסופק (למשל שעות ריכוז " +
        "מועדפות או אירועים קרובים אמיתיים) — ומציע 1-2 פעולות מעשיות וקונקרטיות שיעזרו לו לעבור את היום טוב " +
        "יותר. אם קיימת משמרת עבודה, שים לב במפורש למשך שלה: משמרת ארוכה (בערך 8 שעות ומעלה) היא יום עבודה קשה " +
        "— במקרה כזה הצע במפורש מנוחה אמיתית, זמן שקט או פעילות קלה בערב, ולא הצעה גנרית; אל תתעלם מהעובדה " +
        "שהיה יום עבודה ארוך. מלבד זאת, הפסקת נשימה בין פגישות צפופות, העברת משימה ללא תאריך יעד למחר, פינוי " +
        "זמן בערב למשהו חשוב, וכדומה — לפי מה שרלוונטי בפועל. אל תמציא עובדות אישיות שלא סופקו בהקשר. " +
        "התייחס לפריטים הספציפיים שסופקו (שמות אמיתיים מהיומן/המשימות/המשמרות), לא לעצות כלליות שמתאימות לכל " +
        "יום. בחר את הסמל icon_name המתאים ביותר לכל המלצה: coffee להפסקה/מנוחה, heart לזמן/יחסים עם אנשים " +
        "קרובים, alert-circle לעומס גבוה או דחיפות (כולל יום עבודה ארוך), calendar-clock לשינוי סדר יום/תזמון " +
        "מחדש. ענה בעברית בלבד.",
      prompt: JSON.stringify({ events, tasks, shifts, context }, null, 2),
    });

    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("Daily recommendations generation failed:", err);
    return NextResponse.json({ error: "הניתוח נכשל. נסה שוב." }, { status: 500 });
  }
}
