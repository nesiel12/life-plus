import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { AiQuotaExceededError } from "@/lib/ai/service";
import { learningChunksRepo, practiceAttemptsRepo, practiceQuestionsRepo } from "@/lib/db/practice";
import { hebrewProse } from "@/lib/torah/hebrew";
import { toAttemptView, toQuestionView } from "@/lib/torah/lessons/dto";
import { GRADING_SYSTEM_PROMPT, gradingSchema } from "@/lib/torah/lessons/prompts";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  questionId: z.string().uuid(),
  answer: z.string().trim().min(1).max(5000),
});

/**
 * Submits an answer and grades it against the question's rubric.
 *
 * THE ANSWER IS SAVED FIRST. Grading is a model call that can time out or hit
 * the quota; losing a thoughtful written answer to that is not acceptable. A
 * failed grading returns the saved attempt with no score and says why.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-practice-attempt", limit: 30, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  const parsed = await parseJsonBody(request, schema);
  if (parsed.error) return parsed.error;

  const question = await practiceQuestionsRepo.get(user.id, parsed.data.questionId);
  if (!question) return NextResponse.json({ error: "השאלה לא נמצאה." }, { status: 404 });

  const saved = await practiceAttemptsRepo.insert({
    user_id: user.id,
    question_id: question.id,
    answer: parsed.data.answer,
  });

  if (!isProviderConfigured()) {
    return NextResponse.json({
      question: toQuestionView(question, saved),
      attempt: toAttemptView(saved),
      gradingError: "התשובה נשמרה. אין מפתח AI מחובר לבדיקה — השווה לתשובה המנומקת.",
    });
  }

  try {
    const chunk = question.chunk_id ? await learningChunksRepo.get(user.id, question.chunk_id) : null;
    const rubric = (Array.isArray(question.rubric) ? question.rubric : []) as { criterion: string; weight: number }[];
    const object = await generateStructuredData({
      actor: { kind: "user", userId: user.id },
      schema: gradingSchema,
      system: GRADING_SYSTEM_PROMPT,
      prompt: [
        chunk ? `החומר שנלמד:\n${chunk.body.slice(0, 20_000)}` : null,
        `השאלה: ${question.prompt}`,
        question.model_answer ? `תשובה מנומקת לדוגמה: ${question.model_answer}` : null,
        rubric.length ? `קריטריונים ומשקלים:\n${rubric.map((r) => `- ${r.criterion} (${r.weight})`).join("\n")}` : null,
        `תשובת הלומד: ${parsed.data.answer}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const graded = await practiceAttemptsRepo.update(user.id, saved.id, {
      score: Math.round(Math.min(100, Math.max(0, object.score))),
      ai_feedback: hebrewProse(object.feedback) ?? null,
      rubric_results: object.rubric
        .map((r) => ({ criterion: hebrewProse(r.criterion) ?? r.criterion, met: r.met, note: hebrewProse(r.note) ?? "" }))
        .slice(0, 6) as unknown as Json,
    });
    return NextResponse.json({ question: toQuestionView(question, graded), attempt: toAttemptView(graded) });
  } catch (err) {
    const gradingError =
      err instanceof AiQuotaExceededError
        ? "התשובה נשמרה. הגעת למכסת ה-AI היומית, ולכן הבדיקה תחכה."
        : "התשובה נשמרה, אבל הבדיקה נכשלה. אפשר לשלוח שוב.";
    return NextResponse.json({ question: toQuestionView(question, saved), attempt: toAttemptView(saved), gradingError });
  }
}
