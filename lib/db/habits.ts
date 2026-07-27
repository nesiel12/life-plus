import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

export const habitsRepo = createUserScopedRepo("habits");

type HabitLogRow = Database["public"]["Tables"]["habit_logs"]["Row"];

// habit_logs' toggle semantics (mark complete / mark incomplete for one
// day) don't fit createUserScopedRepo's generic insert(row)/update(id,
// patch)/remove(id) shape — there's no single "the log's own id" the
// caller ever has; toggling always addresses a (habit_id, completed_date)
// pair instead. Same reasoning createUserScopedRepo's own header comment
// gives for tables with a different shape: a small dedicated module,
// built directly on the Supabase client, rather than forcing a mismatched
// operation through the generic repo.
export const habitLogsRepo = {
  ...createUserScopedRepo("habit_logs"),

  // Idempotent via the table's own unique (habit_id, completed_date)
  // constraint — a double-click race lands the same row, not an error.
  async markCompleted(userId: string, habitId: string, completedDate: string): Promise<HabitLogRow> {
    const { data, error } = await getSupabaseClient()
      .from("habit_logs")
      .upsert({ user_id: userId, habit_id: habitId, completed_date: completedDate }, { onConflict: "habit_id,completed_date" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markIncomplete(userId: string, habitId: string, completedDate: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("habit_logs")
      .delete()
      .eq("user_id", userId)
      .eq("habit_id", habitId)
      .eq("completed_date", completedDate);
    if (error) throw error;
  },
};
