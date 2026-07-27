"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { habitsRepo, habitLogsRepo } from "@/lib/db/habits";
import { toHabit } from "@/lib/mappers";

export async function addHabitAction(input: { title: string }) {
  const userId = await getCurrentUserId();
  const row = await habitsRepo.insert({ user_id: userId, title: input.title });
  return toHabit(row);
}

// habit_logs cascades on habit deletion (see the migration's `on delete
// cascade`), so no separate log cleanup is needed here.
export async function deleteHabitAction(habitId: string) {
  const userId = await getCurrentUserId();
  await habitsRepo.remove(userId, habitId);
}

export async function toggleHabitCompletionAction(habitId: string, dateString: string, isCompleted: boolean) {
  const userId = await getCurrentUserId();
  if (isCompleted) {
    await habitLogsRepo.markCompleted(userId, habitId, dateString);
  } else {
    await habitLogsRepo.markIncomplete(userId, habitId, dateString);
  }
}
