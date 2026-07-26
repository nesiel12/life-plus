import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type LearningResourceInsert = Database["public"]["Tables"]["learning_resources"]["Insert"];
type LearningResourceRow = Database["public"]["Tables"]["learning_resources"]["Row"];

const topicsRepoBase = createUserScopedRepo("learning_topics");

export const learningTopicsRepo = {
  ...topicsRepoBase,
  list: (userId: string) => topicsRepoBase.list(userId, { orderBy: "created_at", ascending: false }),

  // Resources FK to a topic, not directly to the user, so every resource
  // mutation must prove the topic it targets is actually the caller's own —
  // same reasoning goals.ts's toggleMilestone verifies goal ownership
  // before touching a milestone.
  async verifyOwnership(userId: string, topicId: string): Promise<void> {
    const { data, error } = await getSupabaseClient()
      .from("learning_topics")
      .select("id")
      .eq("id", topicId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Learning topic not found or not owned by this user");
  },
};

const resourcesRepoBase = createUserScopedRepo("learning_resources");

export const learningResourcesRepo = {
  ...resourcesRepoBase,
  list: (userId: string) => resourcesRepoBase.list(userId, { orderBy: "created_at", ascending: true }),

  // The AI Track Builder creates a whole batch of resources (YouTube/
  // podcast/summary/quiz/equipment) from a single generateLearningPath
  // call — one insert, not N round trips.
  async insertMany(rows: LearningResourceInsert[]): Promise<LearningResourceRow[]> {
    if (rows.length === 0) return [];
    const { data, error } = await getSupabaseClient().from("learning_resources").insert(rows).select();
    if (error) throw error;
    return data ?? [];
  },
};
