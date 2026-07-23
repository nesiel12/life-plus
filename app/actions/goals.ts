"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { goalsRepo } from "@/lib/db/goals";
import { toGoal } from "@/lib/mappers";
import type { LifeAreaKey } from "@/types";

export async function addGoalAction(
  title: string,
  category: LifeAreaKey,
  milestoneTitles: string[],
  options?: { targetDate?: string; personId?: string }
) {
  const userId = await getCurrentUserId();
  const row = await goalsRepo.createWithMilestones(userId, title, category, milestoneTitles, options);
  return toGoal(row);
}

export async function toggleMilestoneAction(goalId: string, milestoneId: string) {
  const userId = await getCurrentUserId();
  await goalsRepo.toggleMilestone(userId, goalId, milestoneId);
}

export async function removeGoalAction(goalId: string) {
  const userId = await getCurrentUserId();
  await goalsRepo.remove(userId, goalId);
}
