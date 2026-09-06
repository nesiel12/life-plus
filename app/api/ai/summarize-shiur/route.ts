import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// AI summarization engine for the Torah Space — takes a raw shiur
// transcript/notes and returns a structured summary (title/tldr/key
// points/suggested rabbi/suggested books). Deliberately not wired to any
// frontend yet; this is the backend endpoint only. Goes through the same
// shared AI provider layer (lib/ai) as app/api/torah/extract, so it works
// with whichever of OPENAI_API_KEY / GEMINI_API_KEY is already configured —
// no new env vars or dependencies needed.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 summaries / 5 min

const MAX_TEXT_CHARS_FOR_LLM = 15_000; // same bound app/api/torah/extract uses to keep the call cost-bounded

const shiurSummarySchema = z.object({
  title: z.string().describe("כותרת תמציתית ומושכת לשיעור, בעברית"),
  tldr: z.string().describe("תקציר קצר של 2-3 משפטים"),
  key_points: z
    .array(z.string())
    .min(3)
    .max(5)
    .describe("3-5 נקודות המפתח המרכזיות של השיעור"),
  suggested_rabbi: z
    .string()
    .nullable()
    .describe("שם הרב הנותן את השיעור, אם ניתן להסיק מהטקסט; אחרת null — אין לנחש"),
  suggested_books: z
    .array(z.string())
    .describe("שמות ספרים או מקורות תורניים ספציפיים שהוזכרו בטקסט (מסכת, פרק בתנ\"ך, ספר הלכה וכו')"),
});

export type ShiurSummary = z.infer<typeof shiurSummarySchema>;

const requestSchema = z.object({
  text: z.string().min(1, "text is required"),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`summarize-shiur:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
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
    return NextResponse.json({ error: "A non-empty 'text' string is required." }, { status: 400 });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "סיכום AI דורש מפתח OpenAI או Gemini מחובר. פנה למנהל המערכת." },
      { status: 503 }
    );
  }

  try {
    const summary = await generateStructuredData({
      actor,
      schema: shiurSummarySchema,
      system:
        "אתה עוזר שמנתח תמלול או הערות של שיעור תורני ומפיק ממנו סיכום מובנה. " +
        "חלץ כותרת תמציתית ומושכת, תקציר קצר של 2-3 משפטים, 3-5 נקודות מפתח מרכזיות של התוכן, " +
        "את שם הרב הנותן את השיעור אם ניתן לזהות אחרת null (אין לנחש), ואת שמות הספרים/המקורות " +
        "התורניים הספציפיים שהוזכרו. ענה אך ורק על סמך התוכן שסופק, ללא המצאות.",
      prompt: parsed.data.text.slice(0, MAX_TEXT_CHARS_FOR_LLM),
    });

    return NextResponse.json(summary);
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("Shiur summarization failed:", err);
    return NextResponse.json({ error: "יצירת הסיכום נכשלה. נסה שוב." }, { status: 500 });
  }
}
