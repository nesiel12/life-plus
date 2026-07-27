"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { tasksRepo } from "@/lib/db/tasks";
import { toTask, toTaskPatch } from "@/lib/mappers";
import type { Task } from "@/types";

// Creation only takes what the New Task modal actually asks for
// (title/description/due date) — status defaults to 'todo' and
// is_high_priority to false at the DB level (see the migration). Both
// remain fully patchable via updateTaskAction (that's how the card's
// done-toggle works), just not exposed as create-time inputs yet.
export async function addTaskAction(input: { title: string; description?: string; dueDate?: string }) {
  const userId = await getCurrentUserId();
  const row = await tasksRepo.insert({
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    due_date: input.dueDate ?? null,
  });
  return toTask(row);
}

export async function updateTaskAction(taskId: string, patch: Partial<Task>) {
  const userId = await getCurrentUserId();
  const row = await tasksRepo.update(userId, taskId, toTaskPatch(patch));
  return toTask(row);
}

export async function deleteTaskAction(taskId: string) {
  const userId = await getCurrentUserId();
  await tasksRepo.remove(userId, taskId);
}
