"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { tasksRepo } from "@/lib/db/tasks";
import { taskCompletionsRepo } from "@/lib/db/taskCompletions";
import { invalidateMomentumDashboard } from "@/lib/gamification/statsService";
import { toTask, toTaskPatch } from "@/lib/mappers";
import { getLocalDateKey } from "@/lib/intelligence/personalDNA/timezone";
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
  invalidateMomentumDashboard(userId);
  return toTask(row);
}

// The Momentum Dashboard's heatmap and streak need *which day* a task was
// completed, not just its current status — see task_completions' migration
// header for why that's a separate ledger rather than a column on this
// mutable row. Every status-changing update goes through here, so this is
// the one place that ledger needs to stay in sync: 'done' records today as
// the completion day (idempotent — re-saving an already-done task just
// keeps today), anything else clears it.
export async function updateTaskAction(taskId: string, patch: Partial<Task>) {
  const userId = await getCurrentUserId();
  const row = await tasksRepo.update(userId, taskId, toTaskPatch(patch));

  if (patch.status === "done") {
    await taskCompletionsRepo.markCompleted(userId, taskId, getLocalDateKey(new Date().toISOString()));
  } else if (patch.status !== undefined) {
    await taskCompletionsRepo.markIncomplete(userId, taskId);
  }

  invalidateMomentumDashboard(userId);
  return toTask(row);
}

export async function deleteTaskAction(taskId: string) {
  const userId = await getCurrentUserId();
  await tasksRepo.remove(userId, taskId);
  invalidateMomentumDashboard(userId);
}
