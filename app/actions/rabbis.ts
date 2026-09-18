"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { rabbisRepo } from "@/lib/db/rabbis";
import { toRabbi, toRabbiPatch } from "@/lib/mappers";
import { z } from "zod";
import { openOrCreateRabbi } from "@/lib/torah/library";
import type { Rabbi } from "@/types";

export async function addRabbiAction(input: { name: string; title?: string; notes?: string }) {
  const userId = await getCurrentUserId();
  const row = await rabbisRepo.insert({
    user_id: userId,
    name: input.name,
    title: input.title ?? null,
    notes: input.notes ?? null,
  });
  return toRabbi(row);
}

const openRabbiSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sefariaSlug: z.string().trim().min(1).max(160).optional(),
  relatedRabbiId: z.string().uuid().optional(),
  relation: z.enum(["teacher", "student"]).optional(),
  origin: z.enum(["import", "ai", "user"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

/**
 * Opens a rabbi's page, creating the rabbi first if he is not in the library
 * — the hop behind a teacher/student in a lineage list or an author in the
 * search command center. When the click came from another rabbi's lineage,
 * the taught_by edge is recorded with the origin of that claim.
 */
export async function openOrCreateRabbiAction(input: z.input<typeof openRabbiSchema>) {
  const userId = await getCurrentUserId();
  return openOrCreateRabbi(userId, openRabbiSchema.parse(input));
}

export async function updateRabbiAction(rabbiId: string, patch: Partial<Rabbi>) {
  const userId = await getCurrentUserId();
  const row = await rabbisRepo.update(userId, rabbiId, toRabbiPatch(patch));
  return toRabbi(row);
}

export async function deleteRabbiAction(rabbiId: string) {
  const userId = await getCurrentUserId();
  await rabbisRepo.remove(userId, rabbiId);
}
