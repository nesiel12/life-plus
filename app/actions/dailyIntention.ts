"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { dailyIntentionsRepo } from "@/lib/db/dailyIntentions";

export async function setTodayIntentionAction(intention: string) {
  const userId = await getCurrentUserId();
  await dailyIntentionsRepo.setForToday(userId, intention);
}
