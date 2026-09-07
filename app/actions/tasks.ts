"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { tasksRepo } from "@/lib/db/tasks";
import { toTask, toTaskPatch } from "@/lib/mappers";
import type { Task } from "@/types";

// Creation takes what the New Task modal asks for (title/description/due
// date), plus priority — which the universal command bar can genuinely
// determine at creation time ("תזכיר לי דחוף להתקשר..."), where the modal
// could only offer another checkbox nobody would tick. `status` still
// defaults to 'todo' at the DB level, and everything stays patchable via
// updateTaskAction.
export async function addTaskAction(input: {
  title: string;
  description?: string;
  dueDate?: string;
  isHighPriority?: boolean;
}) {
  const userId = await getCurrentUserId();
  const row = await tasksRepo.insert({
    user_id: userId,
    title: input.title,
    description: input.description ?? null,
    due_date: input.dueDate ?? null,
    is_high_priority: input.isHighPriority ?? false,
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
