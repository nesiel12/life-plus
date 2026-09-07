import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import type { Database } from "@/types/database";

const repo = createUserScopedRepo("routine_blocks");

/** An importable block, minus the fields the server owns. */
export type RoutineBlockDraft = Omit<
  Database["public"]["Tables"]["routine_blocks"]["Insert"],
  "user_id" | "id" | "imported_at"
>;

export const routineBlocksRepo = {
  ...repo,
  // Chronological, like manual_events and for the same reason: every
  // consumer wants the day in order, and sorting at each call site would be
  // three copies of the same comparator.
  list: (userId: string) => repo.list(userId, { orderBy: "start_minute", ascending: true }),

  /**
   * Replaces the whole timetable in one shot, for a confirmed AI import.
   *
   * Two statements rather than a transaction: PostgREST has no transaction
   * across requests. The delete-then-insert order is deliberate — a failed
   * insert leaves the user with no timetable, which they can see and re-import,
   * whereas insert-then-delete could leave a silently doubled one.
   *
   * `replace` is opt-in from the confirmation UI; the default import path
   * appends, so a second import cannot quietly discard hand-made edits.
   */
  async replaceAll(
    userId: string,
    blocks: RoutineBlockDraft[]
  ) {
    const client = getSupabaseClient();

    const { error: deleteError } = await client
      .from("routine_blocks")
      .delete()
      .eq("user_id", userId);
    if (deleteError) throw deleteError;

    if (blocks.length === 0) return [];

    const { data, error } = await client
      .from("routine_blocks")
      .insert(
        blocks.map((b) => ({
          ...b,
          user_id: userId,
          imported_at: new Date().toISOString(),
        }))
      )
      .select();
    if (error) throw error;
    return data ?? [];
  },

  /** Appends imported blocks, leaving anything already there untouched. */
  async insertMany(
    userId: string,
    blocks: RoutineBlockDraft[]
  ) {
    if (blocks.length === 0) return [];
    const { data, error } = await getSupabaseClient()
      .from("routine_blocks")
      .insert(
        blocks.map((b) => ({
          ...b,
          user_id: userId,
          imported_at: new Date().toISOString(),
        }))
      )
      .select();
    if (error) throw error;
    return data ?? [];
  },
};
