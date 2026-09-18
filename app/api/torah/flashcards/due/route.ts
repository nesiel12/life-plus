import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { toFlashcardView } from "@/lib/torah/lessons/dto";
import { lessonsRepo } from "@/lib/db/lessons";

export const runtime = "nodejs";

/** Cards due now — across every lesson, or one (?lessonId=). */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const lessonId = new URL(request.url).searchParams.get("lessonId") ?? undefined;

  const [cards, lessons] = await Promise.all([
    srsCardsRepo.listDueFiltered(auth.user.id, { lessonId, limit: 40 }),
    lessonsRepo.list(auth.user.id),
  ]);
  const titles = Object.fromEntries(lessons.map((l) => [l.id, l.title]));
  return NextResponse.json({ cards: cards.map(toFlashcardView), lessonTitles: titles });
}
