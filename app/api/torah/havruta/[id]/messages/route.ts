import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { currentUserActor } from "@/lib/ai/actor";
import { havrutaMessagesRepo, havrutaThreadsRepo } from "@/lib/db/havruta";
import { cleanReply, havrutaPrompt, havrutaSystemPrompt, normalizeMoves } from "@/lib/torah/havruta";
import { loadHavrutaSubject } from "@/lib/torah/havrutaContext";
import { toMessageView } from "@/lib/torah/havrutaDto";
import { verifyCitation } from "@/lib/torah/verifyCitation";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(2).max(1500),
});

const replySchema = z.object({
  reply: z.string().describe("תור החברותא, בעברית מקורית של בית המדרש. עד שלוש פסקאות קצרות, מסתיים בשאלה ללומד."),
  moves: z
    .array(z.enum(["kushya", "shita", "chizuk", "birur", "teirutz"]))
    .describe("מה עשה התור: kushya=קושיא, shita=שיטה חולקת, chizuk=חיזוק לדברי הלומד, birur=שאלת בירור, teirutz=תירוץ/יישוב"),
  citations: z
    .array(
      z.object({
        reference: z.string().describe("מראה מקום מלא כולל שם הספר, כפי שנכתב בספרות התורנית"),
        note: z.string().describe("שורה קצרה בעברית: מה נאמר שם ולמה הובא"),
      })
    )
    .describe("עד 3 מקורות שהובאו בתור. רשימה ריקה אם אין מקור ודאי."),
});

/**
 * POST — one turn of the Havruta.
 *
 * STRUCTURED, NOT STREAMED, for the same reason as the book assistant: a
 * challenge is only worth as much as its sources, and each source is resolved
 * by Sefaria (lib/torah/verifyCitation.ts) before the turn is shown.
 *
 * The learner's message is saved BEFORE the model is called: a quota error or
 * a provider outage must never lose what they wrote.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-havruta-turn", limit: 20, windowMs: 5 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const thread = await havrutaThreadsRepo.get(user.id, id);
  if (!thread) return NextResponse.json({ error: "הדיון לא נמצא." }, { status: 404 });

  const subject = await loadHavrutaSubject(user.id, thread.subject_type, thread.subject_id);
  if (!subject) return NextResponse.json({ error: "הנושא של הדיון כבר לא קיים." }, { status: 404 });

  const history = await havrutaMessagesRepo.listForThread(user.id, id);
  const userMessage = await havrutaMessagesRepo.insert({
    user_id: user.id,
    thread_id: id,
    role: "user",
    content: parsed.data.message,
  });
  await havrutaThreadsRepo.touch(user.id, id);

  if (!isProviderConfigured()) {
    return NextResponse.json({ userMessage: toMessageView(userMessage), error: "אין מפתח AI מחובר, אז החברותא לא יכולה לענות כרגע." });
  }

  try {
    const actor = await currentUserActor();
    const object = await generateStructuredData({
      actor,
      schema: replySchema,
      system: havrutaSystemPrompt(thread.mode, subject),
      prompt: havrutaPrompt({
        subject,
        history: history.map((m) => ({ role: m.role, content: m.content })),
        message: parsed.data.message,
      }),
    });

    const contextTitle = subject.type === "book" ? subject.title : undefined;
    const citations = await Promise.all(object.citations.slice(0, 3).map((c) => verifyCitation(c, contextTitle)));

    const assistantMessage = await havrutaMessagesRepo.insert({
      user_id: user.id,
      thread_id: id,
      role: "assistant",
      content: cleanReply(object.reply),
      moves: normalizeMoves(object.moves) as Json,
      citations: citations as unknown as Json,
    });
    await havrutaThreadsRepo.touch(user.id, id);

    return NextResponse.json({ userMessage: toMessageView(userMessage), assistantMessage: toMessageView(assistantMessage) });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    console.error("havruta turn failed:", err);
    return NextResponse.json({ userMessage: toMessageView(userMessage), error: "החברותא לא הצליחה לענות. נסה שוב." });
  }
}
