import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Vision / text food tracker. Two ways in, one shape out:
//   - multipart with `file` = a photo of a plate
//   - JSON { text } = "2 eggs and a slice of bread"
// Either way the model estimates the description, meal type and macros. It is
// an estimate and says so (confidence + note); the UI lets the user correct
// every field before it's logged.

export const runtime = "nodejs";
export const maxDuration = 90;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const foodSchema = z.object({
  description: z.string().describe("תיאור קצר בעברית של מה שנאכל (למשל: 'חזה עוף בגריל עם אורז וסלט')"),
  meal_type: z
    .enum(["breakfast", "lunch", "dinner", "snack", "post-workout"])
    .describe("סוג הארוחה המשוער לפי התוכן"),
  calories: z.number().min(0).max(6000).describe("סך הקלוריות המשוער (kcal)"),
  protein_g: z.number().min(0).max(500).describe("חלבון בגרמים"),
  carbs_g: z.number().min(0).max(800).describe("פחמימות בגרמים"),
  fats_g: z.number().min(0).max(400).describe("שומן בגרמים"),
  confidence: z.enum(["high", "medium", "low"]).describe("עד כמה ההערכה בטוחה"),
  note: z.string().describe("משפט אחד: הנחות שהערכת (גודל מנה, שיטת בישול) או מה לא ברור"),
});

const SYSTEM =
  "אתה תזונאי שמעריך ערכים תזונתיים. קיבלת תמונה של אוכל או תיאור טקסטואלי. " +
  "החזר תיאור קצר, סוג ארוחה, וההערכה הטובה ביותר שלך לקלוריות ולשלושת המאקרו (חלבון/פחמימות/שומן) בגרמים. " +
  "אם גודל המנה לא ברור — הנח מנה סבירה אחת וציין זאת ב-note. אל תמציא מרכיבים שלא נראים/צוינו. " +
  "היה כן לגבי רמת הביטחון: אומדן מתמונה הוא medium לכל היותר, טקסט מפורש עם כמויות יכול להיות high.";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`food-analyze:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "ניתוח מזון דורש מפתח AI מחובר (Gemini או OpenAI)." },
      { status: 503 }
    );
  }

  const actor = await currentUserActor();
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "לא צורפה תמונה." }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "תמונה גדולה מדי (מקסימום 15MB)." }, { status: 413 });
      }
      const jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(1400, 1400, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      const result = await generateStructuredData({
        actor,
        schema: foodSchema,
        system: SYSTEM,
        prompt: "העריך את הערכים התזונתיים של האוכל בתמונה.",
        images: [new Uint8Array(jpeg)],
      });
      return NextResponse.json(result);
    }

    const body = await request.json().catch(() => null);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "יש לתאר מה נאכל." }, { status: 400 });
    }
    if (text.length > 800) {
      return NextResponse.json({ error: "התיאור ארוך מדי." }, { status: 400 });
    }

    const result = await generateStructuredData({
      actor,
      schema: foodSchema,
      system: SYSTEM,
      prompt: `מה שנאכל: ${text}`,
    });
    return NextResponse.json(result);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "ניתוח המזון נכשל. נסה שוב או הזן ידנית." }, { status: 500 });
  }
}
