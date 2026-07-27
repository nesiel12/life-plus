"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { rabbisRepo } from "@/lib/db/rabbis";
import { toRabbi, toRabbiPatch } from "@/lib/mappers";
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

export async function updateRabbiAction(rabbiId: string, patch: Partial<Rabbi>) {
  const userId = await getCurrentUserId();
  const row = await rabbisRepo.update(userId, rabbiId, toRabbiPatch(patch));
  return toRabbi(row);
}

export async function deleteRabbiAction(rabbiId: string) {
  const userId = await getCurrentUserId();
  await rabbisRepo.remove(userId, rabbiId);
}
