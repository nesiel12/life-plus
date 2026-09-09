import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";

// Free-form financial consultation. Deliberately standalone from the CFO
// panel (which analyses real transactions): you can ask "how much emergency
// fund do I need" or "explain a mortgage vs renting" with zero data in the
// app. An optional one-line `financialContext` the client already computed
// (this month's income/expenses) is folded in when present, never required.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 };

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(20),
  financialContext: z.string().trim().max(600).optional(),
});

const SYSTEM = [
  "אתה יועץ פיננסי אישי ב-Life Plus. אתה מדבר עברית טבעית, ישירה ומכבדת, ומסביר מושגים בגובה העיניים.",
  "",
  "כללים:",
  "- אתה עוזר לחשוב: תקציב, קרן חירום, חיסכון, חובות, משכנתא מול שכירות, הבנת מוצרים פיננסיים.",
  "- אתה לא יועץ השקעות מורשה. אל תמליץ על נייר ערך, קרן או אפיק השקעה ספציפי. אם שואלים על השקעות, " +
    "הסבר את העקרונות והסיכונים והפנה ליועץ מורשה.",
  "- אל תמציא מספרים על המשתמש. אם אין לך נתון — שאל, או ענה באופן כללי ואמור שזה כללי.",
  "- תשובות קצרות וקונקרטיות. אם שאלה דורשת כמה נתונים כדי לענות טוב — שאל אותם קודם.",
].join("\n");

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`finance-chat:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { error: "היועץ הפיננסי דורש מפתח AI מחובר (Gemini או OpenAI)." },
      { status: 503 }
    );
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const actor = await currentUserActor();
  const { messages, financialContext } = parsed.data;

  const system = financialContext
    ? `${SYSTEM}\n\nנתון שהמשתמש שיתף על מצבו החודש (השתמש רק אם רלוונטי): ${financialContext}`
    : SYSTEM;

  try {
    const result = await streamChatReply({ actor, system, messages });
    return result.toTextStreamResponse();
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "היועץ הפיננסי לא זמין כרגע. נסה שוב." }, { status: 502 });
  }
}
