import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { practiceSessionsRepo } from "@/lib/db/practice";
import { MAX_BONUS_PER_ROUND, MAX_SESSION_BONUS } from "@/lib/torah/combo";

export const runtime = "nodejs";

const schema = z.object({
  startedAt: z.string().datetime(),
  rounds: z.number().int().min(1).max(200),
  correct: z.number().int().min(0).max(200),
  maxCombo: z.number().int().min(0).max(200),
  bonusXp: z.number().int().min(0).max(MAX_SESSION_BONUS),
});

/**
 * Records a finished battle.
 *
 * The client computes the combo, so the server checks it is POSSIBLE before
 * storing it: correct ≤ rounds, the best combo ≤ correct answers, and no more
 * bonus than the per-round cap allows. The rounds themselves were already
 * recorded as real reviews and attempts; this only adds what their ORDER
 * earned. A forged session can therefore claim at most the capped bonus for
 * rounds that did not happen — bounded, and visible in the history.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-practice-session", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, schema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  const startedAt = new Date(input.startedAt);
  const age = Date.now() - startedAt.getTime();
  if (age < 0 || age > 6 * 3_600_000) return NextResponse.json({ error: "זמן התחלה לא תקין." }, { status: 400 });
  if (input.correct > input.rounds || input.maxCombo > input.correct) {
    return NextResponse.json({ error: "נתוני הסבב לא עקביים." }, { status: 400 });
  }
  if (input.bonusXp > Math.min(MAX_SESSION_BONUS, input.rounds * MAX_BONUS_PER_ROUND)) {
    return NextResponse.json({ error: "בונוס לא אפשרי." }, { status: 400 });
  }

  const row = await practiceSessionsRepo.insert({
    user_id: auth.user.id,
    mode: "battle",
    rounds: input.rounds,
    correct: input.correct,
    max_combo: input.maxCombo,
    bonus_xp: input.bonusXp,
    started_at: startedAt.toISOString(),
  });
  return NextResponse.json({ session: { id: row.id, bonusXp: row.bonus_xp } }, { status: 201 });
}
