import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type TaskCompletionRow = Database["public"]["Tables"]["task_completions"]["Row"];

// Same reasoning as habitLogsRepo (lib/db/habits.ts): completing a task
// addresses it by task_id, not by "the completion's own id" the caller
// never has, so the generic insert/update/remove shape doesn't fit — a
// small dedicated module built directly on the Supabase client instead.
export const taskCompletionsRepo = {
  ...createUserScopedRepo("task_completions"),

  // Idempotent via the table's own unique(task_id) constraint — re-marking
  // an already-completed task just updates which day it landed on.
  async markCompleted(userId: string, taskId: string, completedDate: string): Promise<TaskCompletionRow> {
    const { data, error } = await getSupabaseClient()
      .from("task_completions")
      .upsert({ user_id: userId, task_id: taskId, completed_date: completedDate }, { onConflict: "task_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markIncomplete(userId: string, taskId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("task_completions")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", taskId);
    if (error) throw error;
  },
};
