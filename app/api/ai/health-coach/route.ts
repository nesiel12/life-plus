import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// The instant health coach. Loads with the Health page — no button. Given the
// day's real meals + workouts + the free windows the client computed from the
// routine skeleton, it produces one warm recommendation and, when there's a
// genuinely open stretch, one concrete activity anchored to a real time that
// the user can drop straight into Google Calendar.

export const runtime = "nodejs";
export const maxDuration = 45;

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  nowLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  meals: z
    .array(z.object({ description: z.string(), type: z.string(), time: z.string().optional() }))
    .max(20)
    .default([]),
  workouts: z
    .array(z.object({ title: z.string(), time: z.string().optional(), details: z.string().optional() }))
    .max(20)
    .default([]),
  freeWindows: z
    .array(z.object({ start: z.string(), end: z.string(), durationMinutes: z.number() }))
    .max(12)
    .default([]),
});

const coachSchema = z.object({
  headline: z.string().max(120).describe("משפט אחד חם וישיר: איך היום נראה מבחינה גופנית עד עכשיו"),
  guidance: z
    .string()
    .describe("2-4 משפטים בעברית: מה כדאי לעשות עכשיו/בהמשך היום מבחינת תזונה ותנועה, בהתבסס על מה שכבר נרשם"),
  suggested_activity: z
    .object({
      title: z.string().describe("שם קצר לפעילות, למשל 'הליכה מהירה' או 'אימון כוח קצר'"),
      kind: z.enum(["workout", "walk", "stretch", "meal-prep", "rest", "hydration"]),
      start_local: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
        .describe("זמן התחלה מדויק, חייב ליפול בתוך אחד מחלונות הזמן הפנוי שנמסרו"),
      duration_minutes: z.number().int().min(10).max(180),
      why: z.string().describe("משפט אחד: למה דווקא הפעילות הזו ובזמן הזה"),
    })
    .nullable()
    .describe("פעילות קונקרטית לחלון פנוי אמיתי. null אם אין חלון פנוי מתאים או שהמשתמש כבר עשה מספיק היום"),
});

export type HealthCoachResult = z.infer<typeof coachSchema>;

const SYSTEM = [
  "אתה מאמן תזונה וכושר אישי ב-Life Plus. אתה מדבר עברית טבעית, חמה ומעודדת, בלי סופרלטיבים ובלי הטפות.",
  "",
  "כללים:",
  "- התבסס אך ורק על הנתונים שנמסרו: הארוחות והאימונים שנרשמו היום, והזמן הנוכחי.",
  "- אם נמסרו חלונות זמן פנוי — הצע פעילות אחת קונקרטית ששייכת לחלון אמיתי מהרשימה, עם שעת התחלה מדויקת.",
  "  אל תמציא זמן שלא נמצא באף חלון. אם אין חלון מתאים, החזר suggested_activity=null.",
  "- אל תציע אימון כבד אם המשתמש כבר התאמן היום — הצע התאוששות, הליכה קלה או מתיחות.",
  "- אם לא נרשמו ארוחות בכלל, זה בסדר — הזכר בעדינות ותן הכוונה כללית.",
  "- קצר ומעשי. לא ייעוץ רפואי.",
].join("\n");

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`health-coach:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const actor = await currentUserActor();
  const { nowLocal, meals, workouts, freeWindows } = parsed.data;

  try {
    const result = await generateStructuredData({
      actor,
      schema: coachSchema,
      system: SYSTEM,
      prompt: JSON.stringify({ now: nowLocal, meals, workouts, free_windows: freeWindows }, null, 2),
    });
    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "המאמן לא זמין כרגע." }, { status: 502 });
  }
}
