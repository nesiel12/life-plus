import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { sanitizeEstimate } from "@/lib/health/nutrition";
import { hebrewProse } from "@/lib/torah/hebrew";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  text: z.string().trim().min(2).max(400),
});

const estimateSchema = z.object({
  title: z.string().describe("שם קצר ונקי לארוחה בעברית, עד 6 מילים"),
  items: z
    .array(
      z.object({
        name: z.string().describe("הפריט בעברית, עם הכמות המשוערת (למשל: ״2 ביצים״, ״פרוסת לחם מלא״)"),
        calories: z.number(),
        proteinG: z.number(),
        carbsG: z.number(),
        fatG: z.number(),
      })
    )
    .describe("פירוט לפי פריטים, עד 8"),
  confidence: z.number().min(0).max(1).describe("עד כמה ההערכה מדויקת בהינתן התיאור (כמויות לא ידועות → נמוך)"),
});

/**
 * "מה אכלתי" in words (typed or spoken) → an itemised macro estimate.
 *
 * The model itemises; the totals are then ADDED UP HERE and made consistent
 * (lib/health/nutrition.ts sanitizeEstimate), never taken from a model's own
 * total — arithmetic is exactly what a language model is worst at. The result
 * is shown for review and stored as macro_source 'ai', so an estimate is never
 * mistaken for a number the user typed.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "health-estimate", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "הערכת ערכים תזונתיים דורשת מפתח AI מחובר." }, { status: 503 });
  }

  try {
    const object = await generateStructuredData({
      actor: await currentUserActor(),
      schema: estimateSchema,
      system: [
        "אתה דיאטן קליני. הערך ערכים תזונתיים לארוחה שתוארה, לפי מנות ביתיות מקובלות בישראל.",
        "פרק את הארוחה לפריטים. לכל פריט: קלוריות, חלבון, פחמימות ושומן בגרמים.",
        "כשהכמות לא נאמרה — הנח מנה ממוצעת, וציין את ההנחה בשם הפריט.",
        "אל תמציא פריטים שלא הוזכרו. כתוב אך ורק בעברית.",
      ].join("\n"),
      prompt: `הארוחה: ${parsed.data.text}`,
    });

    const items = object.items.slice(0, 8).map((item) => ({
      name: hebrewProse(item.name) ?? item.name,
      ...sanitizeEstimate(item),
    }));
    const totals = sanitizeEstimate({
      calories: items.reduce((s, i) => s + i.calories, 0),
      proteinG: items.reduce((s, i) => s + i.proteinG, 0),
      carbsG: items.reduce((s, i) => s + i.carbsG, 0),
      fatG: items.reduce((s, i) => s + i.fatG, 0),
    });

    return NextResponse.json({
      title: hebrewProse(object.title) ?? parsed.data.text.slice(0, 60),
      items,
      totals,
      confidence: Math.min(1, Math.max(0, object.confidence)),
    });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[health] estimate failed:", err);
    return NextResponse.json({ error: "ההערכה נכשלה. נסה לתאר את הארוחה במילים אחרות." }, { status: 502 });
  }
}
