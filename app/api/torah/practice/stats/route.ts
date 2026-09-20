import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { learningChunksRepo, practiceAttemptsRepo, practiceHistoryRepo, practiceSessionsRepo } from "@/lib/db/practice";
import { computePracticeStats } from "@/lib/torah/practiceStats";

export const runtime = "nodejs";

/**
 * XP, level, streak and mastery — computed from history on every request,
 * never stored (see lib/torah/practiceStats.ts). ?lessonId= narrows the card
 * figures to one lesson; XP and streak are always the user's whole practice.
 */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lessonId") ?? undefined;
  const timeZone = url.searchParams.get("tz") ?? undefined;

  const [cards, reviews, attempts, completedChunks, sessions] = await Promise.all([
    practiceHistoryRepo.cardStates(user.id, { lessonId }),
    practiceHistoryRepo.reviews(user.id),
    practiceAttemptsRepo.history(user.id),
    learningChunksRepo.countCompleted(user.id),
    practiceSessionsRepo.history(user.id),
  ]);

  let validZone: string | undefined;
  try {
    if (timeZone) {
      new Intl.DateTimeFormat("en", { timeZone });
      validZone = timeZone;
    }
  } catch {
    validZone = undefined;
  }

  const stats = computePracticeStats({
    cards: cards.map((c) => ({
      repetitions: c.repetitions,
      intervalDays: c.interval_days,
      dueAt: new Date(c.due_at),
      suspendedAt: c.suspended_at ? new Date(c.suspended_at) : null,
    })),
    reviews: reviews.map((r) => ({ grade: r.grade, reviewedAt: new Date(r.reviewed_at) })),
    attempts: attempts.map((a) => ({ score: a.score, createdAt: new Date(a.created_at) })),
    completedChunks,
    sessions: sessions.map((row) => ({ bonusXp: row.bonus_xp, maxCombo: row.max_combo, endedAt: new Date(row.ended_at) })),
    timeZone: validZone,
  });
  return NextResponse.json({ stats });
}
