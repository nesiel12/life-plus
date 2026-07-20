"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { insightsRepo } from "@/lib/db/insights";
import { toInsight } from "@/lib/mappers";

export async function addInsightAction(content: string) {
  const userId = await getCurrentUserId();
  const row = await insightsRepo.insert({ user_id: userId, content });
  return toInsight(row);
}
