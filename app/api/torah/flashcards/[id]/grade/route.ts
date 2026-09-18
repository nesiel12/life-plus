import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { srsCardsRepo } from "@/lib/db/srsCards";
import { toFlashcardView } from "@/lib/torah/lessons/dto";
import { GRADE_BY_ANSWER } from "@/lib/torah/srs";

export const runtime = "nodejs";

const schema = z.object({
  answer: z.enum(["again", "hard", "good", "easy"]),
  durationMs: z.number().int().min(0).max(30 * 60 * 1000).optional(),
});

/** One flashcard review — the SM-2 maths lives in lib/torah/srs.ts. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-flashcard-grade", limit: 240, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, schema);
  if (parsed.error) return parsed.error;
  const { id } = await context.params;

  try {
    const card = await srsCardsRepo.grade(auth.user.id, id, GRADE_BY_ANSWER[parsed.data.answer], {
      durationMs: parsed.data.durationMs,
    });
    return NextResponse.json({ card: toFlashcardView(card) });
  } catch {
    return NextResponse.json({ error: "הכרטיסייה לא נמצאה." }, { status: 404 });
  }
}
