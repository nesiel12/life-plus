import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import type { Database } from "@/types/database";

type GoalRow = Database["public"]["Tables"]["goals"]["Row"];
type MilestoneRow = Database["public"]["Tables"]["milestones"]["Row"];

const goalsRepoBase = createUserScopedRepo("goals");

export interface GoalWithMilestones extends GoalRow {
  milestones: MilestoneRow[];
}

export const goalsRepo = {
  remove: goalsRepoBase.remove, // milestones cascade via FK, nothing extra needed

  async listWithMilestones(userId: string): Promise<GoalWithMilestones[]> {
    const client = getSupabaseClient();
    const goals = await goalsRepoBase.list(userId, { orderBy: "created_at", ascending: false });
    if (goals.length === 0) return [];

    const { data: milestones, error } = await client
      .from("milestones")
      .select("*")
      .in(
        "goal_id",
        goals.map((g) => g.id)
      )
      .order("position", { ascending: true });
    if (error) throw error;

    return goals.map((goal) => ({
      ...goal,
      milestones: (milestones ?? []).filter((m) => m.goal_id === goal.id),
    }));
  },

  async createWithMilestones(
    userId: string,
    title: string,
    category: GoalRow["category"],
    milestoneTitles: string[]
  ): Promise<GoalWithMilestones> {
    const goal = await goalsRepoBase.insert({ user_id: userId, title, category });

    const client = getSupabaseClient();
    if (milestoneTitles.length === 0) return { ...goal, milestones: [] };

    const { data: milestones, error } = await client
      .from("milestones")
      .insert(
        milestoneTitles.map((milestoneTitle, position) => ({
          goal_id: goal.id,
          title: milestoneTitle,
          position,
        }))
      )
      .select();
    if (error) throw error;

    return { ...goal, milestones: milestones ?? [] };
  },

  // Ownership is verified via the goal→user_id join before the milestone is
  // touched — a milestoneId alone is never enough to authorize a mutation.
  async toggleMilestone(userId: string, goalId: string, milestoneId: string): Promise<MilestoneRow> {
    const client = getSupabaseClient();

    const { data: goal, error: goalError } = await client
      .from("goals")
      .select("id")
      .eq("id", goalId)
      .eq("user_id", userId)
      .maybeSingle();
    if (goalError) throw goalError;
    if (!goal) throw new Error("Goal not found or not owned by this user");

    const { data: current, error: readError } = await client
      .from("milestones")
      .select("done")
      .eq("id", milestoneId)
      .eq("goal_id", goalId)
      .single();
    if (readError) throw readError;

    const { data: updated, error: updateError } = await client
      .from("milestones")
      .update({ done: !current.done })
      .eq("id", milestoneId)
      .eq("goal_id", goalId)
      .select()
      .single();
    if (updateError) throw updateError;

    return updated;
  },
};
