import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";
import { aiQuotaResponse } from "@/lib/api/aiErrorResponse";
import { lessonsRepo } from "@/lib/db/lessons";
import { learningChunksRepo, practiceAttemptsRepo, practiceQuestionsRepo } from "@/lib/db/practice";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { hebrewProse } from "@/lib/torah/hebrew";
import { toChunkView, toFlashcardView, toQuestionView } from "@/lib/torah/lessons/dto";
import { CHUNK_PRACTICE_SYSTEM_PROMPT, challengeQuestionsSchema, chunkPracticeSchema } from "@/lib/torah/lessons/prompts";
import { readyForChallenge } from "@/lib/torah/adaptive";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 90;

const PRACTICE_TIMEOUT_MS = 60_000;

/**
 * A learning chunk's practice set: its scenario questions and its flashcards.
 *
 * Generated on first open and stored — so questions are created only for parts
 * someone actually reaches, and returning to a part shows the same questions
 * with the user's previous answers rather than a fresh random set.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; chunkId: string }> }) {
  const body = (await request.json().catch(() => ({}))) as { challenge?: unknown };
  const challenge = body?.challenge === true;
  const auth = await requireSessionUser({ key: "torah-practice-open", limit: 30, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id: lessonId, chunkId } = await context.params;

  const [lesson, chunk] = await Promise.all([lessonsRepo.get(user.id, lessonId), learningChunksRepo.get(user.id, chunkId)]);
  if (!lesson || !chunk || chunk.lesson_id !== lessonId) {
    return NextResponse.json({ error: "החלק לא נמצא." }, { status: 404 });
  }

  let questions = await practiceQuestionsRepo.listForChunk(user.id, chunkId);
  let cards = await srsCardsRepo.listForChunk(user.id, chunkId);

  if (questions.length === 0) {
    if (!isProviderConfigured()) {
      return NextResponse.json({ error: "אין מפתח AI מחובר, ולכן אי אפשר ליצור תרגול." }, { status: 503 });
    }
    try {
      const object = await generateStructuredData({
        actor: { kind: "user", userId: user.id },
        schema: chunkPracticeSchema,
        system: CHUNK_PRACTICE_SYSTEM_PROMPT,
        prompt: [
          `השיעור: ${lesson.title}`,
          lesson.summary ? `סיכום השיעור כולו (להקשר בלבד): ${lesson.summary.slice(0, 1500)}` : null,
          `החלק לתרגול — "${chunk.title}":`,
          chunk.body.slice(0, 40_000),
        ]
          .filter(Boolean)
          .join("\n\n"),
        timeoutMs: PRACTICE_TIMEOUT_MS,
      });

      questions = await practiceQuestionsRepo.insertMany(
        object.questions.slice(0, 4).flatMap((q) => {
          const prompt = hebrewProse(q.prompt);
          if (!prompt) return [];
          return [
            {
              user_id: user.id,
              lesson_id: lessonId,
              chunk_id: chunkId,
              kind: q.kind,
              prompt,
              model_answer: hebrewProse(q.modelAnswer) ?? null,
              rubric: q.rubric
                .map((r) => ({ criterion: hebrewProse(r.criterion) ?? "", weight: Math.max(0, r.weight) }))
                .filter((r) => r.criterion) as unknown as Json,
              difficulty: Math.min(5, Math.max(1, Math.round(q.difficulty))),
            },
          ];
        })
      );

      // Cards only when this part has none yet — re-opening a part after its
      // questions were deleted must not stack a second deck.
      if (cards.length === 0) {
        cards = await srsCardsRepo.insertMany(
          object.flashcards.slice(0, 8).flatMap((card) => {
            const front = hebrewProse(card.front);
            const back = hebrewProse(card.back);
            return front && back
              ? [{ user_id: user.id, front, back, source_type: "lesson" as const, source_id: lessonId, chunk_id: chunkId }]
              : [];
          })
        );
      }
    } catch (err) {
      const quota = aiQuotaResponse(err);
      if (quota) return quota;
      console.error("[practice] generation failed:", err);
      return NextResponse.json({ error: "יצירת התרגול נכשלה. נסה שוב." }, { status: 502 });
    }
  }

  let attempts = await practiceAttemptsRepo.listForQuestions(user.id, questions.map((q) => q.id));
  let latestByQuestion = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    if (!latestByQuestion.has(attempt.question_id)) latestByQuestion.set(attempt.question_id, attempt);
  }

  // "אתגר קשה יותר": two harder questions, appended. Only when the part is
  // genuinely mastered (lib/torah/adaptive.ts readyForChallenge) and every
  // question so far has been answered — a challenge is a reward, not a skip.
  if (challenge) {
    const scores = questions.map((q) => latestByQuestion.get(q.id)?.score ?? null);
    const allAnswered = questions.every((q) => latestByQuestion.has(q.id));
    if (!allAnswered || !readyForChallenge(scores)) {
      return NextResponse.json({ error: "האתגר נפתח אחרי שעונים על כל השאלות בממוצע 80 ומעלה." }, { status: 409 });
    }
    if (!isProviderConfigured()) {
      return NextResponse.json({ error: "אין מפתח AI מחובר, ולכן אי אפשר ליצור אתגר." }, { status: 503 });
    }
    try {
      const object = await generateStructuredData({
        actor: { kind: "user", userId: user.id },
        schema: challengeQuestionsSchema,
        system: CHUNK_PRACTICE_SYSTEM_PROMPT,
        prompt: [
          `השיעור: ${lesson.title}`,
          `החלק — "${chunk.title}":`,
          chunk.body.slice(0, 40_000),
          `שאלות שכבר נשאלו (אל תחזור עליהן):\n${questions.map((q) => `- ${q.prompt}`).join("\n")}`,
          "הלומד שולט בחומר. בנה שתי שאלות קשות באמת (קושי 4-5).",
        ].join("\n\n"),
        timeoutMs: PRACTICE_TIMEOUT_MS,
      });
      const added = await practiceQuestionsRepo.insertMany(
        object.questions.slice(0, 2).flatMap((q) => {
          const prompt = hebrewProse(q.prompt);
          if (!prompt) return [];
          return [
            {
              user_id: user.id,
              lesson_id: lessonId,
              chunk_id: chunkId,
              kind: q.kind,
              prompt,
              model_answer: hebrewProse(q.modelAnswer) ?? null,
              rubric: q.rubric
                .map((r) => ({ criterion: hebrewProse(r.criterion) ?? "", weight: Math.max(0, r.weight) }))
                .filter((r) => r.criterion) as unknown as Json,
              difficulty: Math.min(5, Math.max(4, Math.round(q.difficulty))),
            },
          ];
        })
      );
      questions = [...questions, ...added];
      attempts = await practiceAttemptsRepo.listForQuestions(user.id, questions.map((q) => q.id));
      latestByQuestion = new Map();
      for (const attempt of attempts) {
        if (!latestByQuestion.has(attempt.question_id)) latestByQuestion.set(attempt.question_id, attempt);
      }
    } catch (err) {
      const quota = aiQuotaResponse(err);
      if (quota) return quota;
      console.error("[practice] challenge failed:", err);
      return NextResponse.json({ error: "יצירת האתגר נכשלה. נסה שוב." }, { status: 502 });
    }
  }

  return NextResponse.json({
    chunk: toChunkView(chunk),
    questions: questions.map((q) => toQuestionView(q, latestByQuestion.get(q.id))),
    flashcards: cards.map(toFlashcardView),
  });
}
