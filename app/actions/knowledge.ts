"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { toKnowledgeEntry } from "@/lib/mappers";

export async function addKnowledgeEntryAction(input: {
  date: string;
  topic: string;
  source: string;
  summary: string;
  durationMinutes?: number;
}) {
  const userId = await getCurrentUserId();
  const row = await knowledgeEntriesRepo.insert({
    user_id: userId,
    entry_date: input.date,
    topic: input.topic,
    source: input.source,
    summary: input.summary,
    duration_minutes: input.durationMinutes,
  });
  return toKnowledgeEntry(row);
}

export async function markKnowledgeReviewedAction(entryId: string) {
  const userId = await getCurrentUserId();
  const row = await knowledgeEntriesRepo.markReviewed(userId, entryId);
  return toKnowledgeEntry(row);
}
