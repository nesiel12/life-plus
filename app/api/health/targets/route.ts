import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { readTargets } from "@/lib/health/nutrition";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

/** The user's daily nutrition and water targets, defaults filled in. */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const dna = await personalDnaRepo.get(auth.user.id).catch(() => null);
  const stored = dna?.health_targets;
  const custom = Boolean(stored && typeof stored === "object" && Object.keys(stored as object).length > 0);
  return NextResponse.json({ targets: readTargets(stored), custom });
}

const targetsSchema = z.object({
  calories: z.number().min(800).max(6000),
  proteinG: z.number().min(20).max(400),
  carbsG: z.number().min(20).max(800),
  fatG: z.number().min(10).max(300),
  waterMl: z.number().min(500).max(6000),
});

export async function PUT(request: Request) {
  const auth = await requireSessionUser({ key: "health-targets", limit: 20, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, targetsSchema);
  if (parsed.error) return parsed.error;
  const targets = readTargets(parsed.data);
  await personalDnaRepo.upsert(auth.user.id, { health_targets: targets as unknown as Json });
  return NextResponse.json({ targets, custom: true });
}
