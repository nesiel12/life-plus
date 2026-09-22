import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { streamChatReply, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { isSosMessage } from "@/lib/ai/fabIntents";

export const runtime = "nodejs";
export const maxDuration = 30;

// The עוזר קולי's fast half (app/api/voice/parse/route.ts is the slow,
// structured-extraction half — see lib/voice/multiIntentParser.ts's header
// for why the two are split). This route does exactly one thing: hold up a
// natural, speakable Hebrew reply as fast as a model can stream one. No
// calendar fetch, no finance/task/study grounding, none of app/api/chat's
// context-injection weight — a voice conversation needs a reply in under a
// second or the "talking to it" feeling breaks, and grounding data the
// person didn't ask about is exactly the latency this route exists to not
// pay. Whatever the reply implies (a task, an expense, a completed chapter)
// is the parse route's job, running in parallel, not this one's.
const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

const voiceChatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) }))
    .max(20)
    .optional(),
});

const SYSTEM_PROMPT = `את/ה "עוזר קולי" — העוזר האישי המדובר של Life Plus. המשתמש מדבר איתך בקול, ואת/ה עונה בקול — כל תשובה שלך תוקרא בקול רם על ידי מנוע הקראה, לא תוצג כטקסט לקריאה עצמית.

לכן:
- תשובות קצרות: משפט או שניים, שלושה לכל היותר. לא רשימות, לא כותרות, לא סימני כוכבית או עיצוב — רק משפטים מדוברים טבעיים.
- טון חם, ישיר, טבעי — כמו שיחה עם עוזר אישי אמיתי, לא כמו קריאת מסמך.
- אם המשתמש מספר לך משהו שקרה (למד, הוציא כסף, דיבר עם מישהו, ביקש תזכורת) — אשר בקצרה שקלטת את זה בחום, ואל תמנה בחזרה את כל הפרטים כאילו את/ה ממלא טופס; זיהוי הפרטים והרישום בפועל קורה במקביל, ברקע.
- אם לא ברור מה המשתמש רוצה, שאל שאלה אחת קצרה וממוקדת.
- לעולם אל תמציא עובדה שלא נאמרה.`;

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await parseJsonBody(request, voiceChatRequestSchema);
  if (parsed.error) return parsed.error;
  const { message, history = [] } = parsed.data;

  // Same backstop as every other free-text surface — the client already
  // checks this before the request is sent (hooks/useVoiceAssistant.ts).
  if (isSosMessage(message)) {
    return new Response("", { headers: { "x-atlas-voice-sos": "1" } });
  }

  const limited = rateLimitResponse(`voice-chat:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  if (!isProviderConfigured()) {
    return new Response("אני כאן, אבל עדיין אין לי חיבור ל-AI מוגדר. אפשר להמשיך לרשום דברים בינתיים.", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const actor = await currentUserActor();
    const result = await streamChatReply({
      actor,
      system: SYSTEM_PROMPT,
      messages: [...history, { role: "user", content: message }],
    });
    return result.toTextStreamResponse();
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("[voice/chat] streamChatReply failed:", err);
    return new Response("לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.", {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
