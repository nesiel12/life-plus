"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { goalsRepo } from "@/lib/db/goals";
import { toGoal } from "@/lib/mappers";
import type { LifeAreaKey, Milestone } from "@/types";

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

// The write side of "link a learning topic to an active goal" (Learning OS
// goal synergy) — appends one milestone rather than requiring a second,
// bespoke "linked topics" list on Goal.
export async function addMilestoneAction(goalId: string, title: string): Promise<Milestone> {
  const userId = await getCurrentUserId();
  const row = await goalsRepo.addMilestone(userId, goalId, title);
  return { id: row.id, title: row.title, done: row.done, completedAt: row.completed_at ?? undefined, dueDate: row.due_date ?? undefined };
}
