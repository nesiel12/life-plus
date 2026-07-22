import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { personalPatternsRepo } from "@/lib/db/personalPatterns";
import { MIN_CONFIDENCE_TO_SURFACE } from "@/lib/intelligence/personalDNA/confidence";
import { getLocalHour } from "@/lib/intelligence/personalDNA/timezone";
import { deriveEnergyLevel, type PeakActivityPattern } from "@/lib/energy/deriveEnergyLevel";
import type { MomentCategory } from "@/types";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 20, windowMs: 5 * 60 * 1000 }; // 20 requests / 5 min

// Today's energy-level card (docs/ATLAS_ARCHITECTURE_VISION.md §12): reads
// personal_patterns directly, the same "raw values, not buildAtlasContext's
// pre-formatted prose" reasoning every other Experience Layer insights
// route already follows (Goals/Learning/Areas/Family) — this needs the
// pattern's actual `value`/`confidence` for arithmetic, not a sentence.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`today-energy:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ level: "unknown", matchingAreas: [], rationale: "" });
  }

  const rows = await personalPatternsRepo.list(user.id);
  const patterns: PeakActivityPattern[] = rows
    .filter((row) => row.pattern_type === "peakActivityWindow" && row.confidence >= MIN_CONFIDENCE_TO_SURFACE)
    .map((row) => ({
      area: row.subject as MomentCategory,
      window: row.value as PeakActivityPattern["window"],
      confidence: row.confidence,
    }));

  const currentHour = getLocalHour(new Date().toISOString());
  const reading = deriveEnergyLevel(patterns, currentHour);

  return NextResponse.json(reading);
}
