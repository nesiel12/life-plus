"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { summariesRepo } from "@/lib/db/summaries";
import { toSummary, toSummaryPatch } from "@/lib/mappers";
import type { Summary } from "@/types";

export async function addSummaryAction(input: {
  title: string;
  content: string;
  contentHtml?: string;
  isDraft?: boolean;
  entityType?: Summary["entityType"];
  entityId?: string;
  mentions?: Summary["mentions"];
}) {
  const userId = await getCurrentUserId();
  const row = await summariesRepo.insert({
    user_id: userId,
    title: input.title,
    content: input.content,
    content_html: input.contentHtml ?? null,
    is_draft: input.isDraft ?? false,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    mentions: (input.mentions ?? []) as never,
  });
  return toSummary(row);
}

export async function updateSummaryAction(summaryId: string, patch: Partial<Summary>) {
  const userId = await getCurrentUserId();
  const row = await summariesRepo.update(userId, summaryId, toSummaryPatch(patch));
  return toSummary(row);
}

export async function deleteSummaryAction(summaryId: string) {
  const userId = await getCurrentUserId();
  await summariesRepo.remove(userId, summaryId);
}
