import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { buildIntelligenceSignals, rankSignals, detectPriorityConflicts } from "@/lib/intelligence/core";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min
const MAX_BRIEFING_SIGNALS = 4;

// The Experience Layer's first real consumer of the Atlas Intelligence
// Engine as a *user-facing* surface, not just an LLM prompt (docs/ATLAS_
// ARCHITECTURE_VISION.md §9/§10) — the same buildAtlasContext ->
// buildIntelligenceSignals -> rankSignals pipeline every AI route already
// uses, rendered for a person instead of a model. No new intelligence, no
// new ranking rules — this route only exposes what already exists.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`briefing:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ signals: [], conflicts: [] });
  }

  const context = await buildAtlasContext(user.id);
  const ranked = rankSignals(buildIntelligenceSignals(context));
  const conflicts = detectPriorityConflicts(ranked);

  return NextResponse.json({
    signals: ranked.slice(0, MAX_BRIEFING_SIGNALS).map((signal) => ({
      id: signal.id,
      category: signal.category,
      summary: signal.summary,
      confidence: signal.confidence,
    })),
    conflicts: conflicts.map((conflict) => conflict.note),
  });
}
