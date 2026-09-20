import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { lessonsRepo } from "@/lib/db/lessons";
import { practiceAttemptsRepo, practiceQuestionsRepo } from "@/lib/db/practice";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { startingDifficulty } from "@/lib/torah/adaptive";
import { toFlashcardView, toQuestionView } from "@/lib/torah/lessons/dto";

export const runtime = "nodejs";

const MAX_CARDS = 12;
const MAX_QUESTIONS = 6;
// Dilemmas and counter-arguments lead a battle: they are the rounds that make
// someone think, and a battle of pure recall is just a review session.
const KIND_PRIORITY: Record<string, number> = { dilemma: 0, counter: 1, scenario: 2, application: 3, compare: 4, recall: 5 };

/**
 * The deck for one "קרב חברותא": cards due now, plus written questions worth
 * another attempt (never answered, or last scored below 70), with the learner's
 * recent scores so the client can start the difficulty staircase in the right
 * place (lib/torah/adaptive.ts).
 */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;

  const [cards, questions, lessons] = await Promise.all([
    srsCardsRepo.listDue(user.id, MAX_CARDS),
    practiceQuestionsRepo.list(user.id),
    lessonsRepo.list(user.id),
  ]);
  const attempts = await practiceAttemptsRepo.listForQuestions(
    user.id,
    questions.map((q) => q.id)
  );
  const latest = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) if (!latest.has(attempt.question_id)) latest.set(attempt.question_id, attempt);

  const open = questions
    .filter((q) => {
      const last = latest.get(q.id);
      return !last || (last.score !== null && last.score < 70);
    })
    .sort((a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9) || b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_QUESTIONS);

  const recentScores = attempts
    .filter((a) => typeof a.score === "number")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a) => a.score as number);

  const titles = Object.fromEntries(lessons.map((l) => [l.id, l.title]));
  return NextResponse.json({
    cards: cards.map(toFlashcardView),
    // A question still worth practising is presented fresh: no model answer yet.
    questions: open.map((q) => ({ ...toQuestionView(q, undefined), lessonTitle: q.lesson_id ? titles[q.lesson_id] ?? null : null })),
    startingDifficulty: startingDifficulty(recentScores),
    lessonTitles: titles,
  });
}
