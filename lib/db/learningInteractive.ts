import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type CheckpointRow = Database["public"]["Tables"]["video_checkpoints"]["Row"];
type RoadmapRow = Database["public"]["Tables"]["learning_roadmaps"]["Row"];

const checkpointsBase = createUserScopedRepo("video_checkpoints");
const roadmapsBase = createUserScopedRepo("learning_roadmaps");

export const videoCheckpointsRepo = {
  ...checkpointsBase,

  async findByVideo(userId: string, videoId: string): Promise<CheckpointRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("video_checkpoints")
      .select("*")
      .eq("user_id", userId)
      .eq("video_id", videoId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};

export const learningRoadmapsRepo = {
  ...roadmapsBase,

  async findByTopic(userId: string, topicId: string): Promise<RoadmapRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("learning_roadmaps")
      .select("*")
      .eq("user_id", userId)
      .eq("topic_id", topicId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
};
