"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { summarySectionsRepo } from "@/lib/db/summarySections";
import { toSummarySection, toSummarySectionPatch } from "@/lib/mappers";
import type { SummarySection } from "@/types";

export async function listSummarySectionsAction() {
  const userId = await getCurrentUserId();
  const rows = await summarySectionsRepo.list(userId);
  return rows.map(toSummarySection);
}

export async function addSummarySectionAction(input: { name: string; icon?: string; sortOrder: number }) {
  const userId = await getCurrentUserId();
  const row = await summarySectionsRepo.insert({
    user_id: userId,
    name: input.name,
    icon: input.icon ?? null,
    sort_order: input.sortOrder,
  });
  return toSummarySection(row);
}

export async function updateSummarySectionAction(sectionId: string, patch: Partial<SummarySection>) {
  const userId = await getCurrentUserId();
  const row = await summarySectionsRepo.update(userId, sectionId, toSummarySectionPatch(patch));
  return toSummarySection(row);
}

export async function deleteSummarySectionAction(sectionId: string) {
  const userId = await getCurrentUserId();
  // Summaries filed here are NOT deleted — the column is ON DELETE SET NULL,
  // so they fall back to unassigned. Destroying someone's writing because
  // they removed a category would be indefensible.
  await summarySectionsRepo.remove(userId, sectionId);
}

/** Persists a reorder as one pass. Callers send only the changed rows. */
export async function reorderSummarySectionsAction(changes: { id: string; sortOrder: number }[]) {
  const userId = await getCurrentUserId();
  for (const change of changes) {
    await summarySectionsRepo.update(userId, change.id, { sort_order: change.sortOrder });
  }
}
