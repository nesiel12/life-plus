import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// AI Nutrition Coach for the Health & Fitness Space (Phase 8): given the
// day's real workouts and previously logged meals, asks the AI to act as a
// sports nutritionist and return a personalized, structured meal
// recommendation — same shape as every other app/api/ai/* route (session
// check, rate limit, zod-validated body, honest isProviderConfigured()
// gate). Used from exactly one place (the Health page's "AI Nutrition
// Coach" button, called directly via fetch — no persistence involved, so
// no shared lib/ai module or Server Action needed the way the Learning
// Space's Track Builder required for its write-heavy flow).

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 recommendations / 5 min

const workoutInputSchema = z.object({
  title: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  routineDetails: z.string().optional(),
});

const mealInputSchema = z.object({
  description: z.string(),
  eatenAt: z.string(),
  type: z.enum(["breakfast", "lunch", "dinner", "snack", "post-workout"]),
});

const requestSchema = z.object({
  workouts: z.array(workoutInputSchema),
  meals: z.array(mealInputSchema),
});

const nutritionSchema = z.object({
  recommendation: z
    .string()
    .describe(
      "המלצה תזונתית מותאמת אישית בעברית, 2-4 משפטים — מתייחסת במפורש לאימונים ולארוחות שכבר נרשמו היום " +
        "(למשל: תזונה לאחר אימון כוח דורש חלבון, לא כמו לאחר אימון סיבולת). אם אין אימונים היום, המלצה כללית " +
        "מבוססת על הארוחות שכבר נרשמו, לא המצאה של אימון שלא קרה."
    ),
  suggested_menu: z
    .array(
      z.object({
        item: z.string().describe("פריט מזון או מנה ספציפיים"),
        benefit: z.string().describe("התועלת התזונתית הספציפית של הפריט הזה, בהקשר לאימון/יום של המשתמש"),
      })
    )
    .min(2)
    .max(6)
    .describe("תפריט מוצע של 2-6 פריטים, כל אחד עם הסבר קצר לתועלת שלו"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`nutrition:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
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
    return NextResponse.json({ error: "'workouts' and 'meals' arrays are required." }, { status: 400 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "מאמן התזונה של AI דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  try {
    const recommendation = await generateStructuredData({
      actor,
      schema: nutritionSchema,
      system:
        "אתה תזונאי ספורט מומחה שמעניק המלצות תזונה מותאמות אישית. קיבלת את רשימת האימונים והארוחות שהמשתמש " +
        "רשם היום. נתח את העומס הגופני שלו (סוג האימון, משך, פרטי השגרה אם צוינו) ואת מה שכבר אכל היום, וספק " +
        "המלצה תזונתית קונקרטית ומעשית — למשל, לאחר אימון כוח מומלץ תפריט עתיר חלבון לשיקום שרירים, לאחר אימון " +
        "סיבולת ארוך מומלץ חידוש פחמימות ואלקטרוליטים. אם אין אימונים היום, תן המלצה כללית מאוזנת בהתבסס על " +
        "הארוחות שנרשמו. ענה אך ורק על סמך הנתונים שסופקו, ללא המצאת אימונים או ארוחות שלא צוינו.",
      prompt: JSON.stringify({ workouts: parsed.data.workouts, meals: parsed.data.meals }, null, 2),
    });

    return NextResponse.json(recommendation);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("Nutrition recommendation failed:", err);
    return NextResponse.json({ error: "יצירת ההמלצה נכשלה. נסה שוב." }, { status: 500 });
  }
}
