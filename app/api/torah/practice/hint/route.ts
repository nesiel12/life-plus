import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { learningChunksRepo, practiceQuestionsRepo } from "@/lib/db/practice";
import { hebrewProse } from "@/lib/torah/hebrew";

export const runtime = "nodejs";
export const maxDuration = 45;

const schema = z.object({
  questionId: z.string().uuid(),
  /** What the learner has written so far — the hint meets them where they are. */
  draft: z.string().max(3000).optional(),
  /** Hints already given, so the next one goes a step further, not in circles. */
  previous: z.array(z.string().max(400)).max(3).optional(),
});

const hintSchema = z.object({
  hint: z.string().describe("רמז קצר בעברית, משפט אחד או שניים, בלשון חברותא. שאלה מכוונת או סברא — לא התשובה."),
});

/**
 * "רמז מהחברותא" — a Socratic nudge on a practice question.
 *
 * The model sees the model answer (so the hint points the right way) and is
 * told never to state it. Each further hint goes one step deeper; three is the
 * limit, after which the learner should answer and read the reasoned answer.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-practice-hint", limit: 30, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, schema);
  if (parsed.error) return parsed.error;

  const question = await practiceQuestionsRepo.get(auth.user.id, parsed.data.questionId);
  if (!question) return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });
  if ((parsed.data.previous?.length ?? 0) >= 3) {
    return NextResponse.json({ error: "זה היה הרמז האחרון — נסה לענות, והתשובה המנומקת תחכה לך אחרי." }, { status: 400 });
  }
  if (!isProviderConfigured()) {
    return NextResponse.json({ error: "אין מפתח AI מחובר, ולכן אין רמזים כרגע." }, { status: 503 });
  }

  try {
    const chunk = question.chunk_id ? await learningChunksRepo.get(auth.user.id, question.chunk_id) : null;
    const object = await generateStructuredData({
      actor: { kind: "user", userId: auth.user.id },
      schema: hintSchema,
      system: [
        "אתה חברותא שעוזר ללומד לחשוב, לא עונה במקומו.",
        "תן רמז אחד בלבד: שאלה מכוונת, הבחנה, או הפניה לסברא שנלמדה. לעולם אל תכתוב את התשובה עצמה ואל תצטט אותה.",
        "אם כבר ניתנו רמזים — התקדם צעד אחד מעבר להם, בלי לחזור עליהם.",
        "כתוב אך ורק בעברית, בנימה חמה וקצרה.",
      ].join("\n"),
      prompt: [
        chunk ? `החומר שנלמד (להקשר): ${chunk.body.slice(0, 6000)}` : null,
        `השאלה: ${question.prompt}`,
        question.model_answer ? `התשובה המנומקת (לעיניך בלבד — אסור לגלות): ${question.model_answer}` : null,
        parsed.data.draft?.trim() ? `מה שהלומד כתב עד כה: ${parsed.data.draft.trim()}` : "הלומד עוד לא כתב דבר.",
        parsed.data.previous?.length ? `רמזים שכבר ניתנו:\n${parsed.data.previous.map((h) => `- ${h}`).join("\n")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    const hint = hebrewProse(object.hint);
    if (!hint) return NextResponse.json({ error: "לא הצלחנו לנסח רמז. נסה שוב." }, { status: 502 });
    return NextResponse.json({ hint });
  } catch (err) {
    const quota = aiQuotaResponse(err);
    if (quota) return quota;
    return NextResponse.json({ error: "הרמז נכשל. נסה שוב." }, { status: 502 });
  }
}
