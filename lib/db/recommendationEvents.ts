import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type RecommendationEventRow = Database["public"]["Tables"]["recommendation_events"]["Row"];
type RecommendationEventInsert = Database["public"]["Tables"]["recommendation_events"]["Insert"];
type RecommendationStatus = Database["public"]["Tables"]["recommendation_events"]["Row"]["status"];

export const recommendationEventsRepo = {
  async create(
    userId: string,
    event: Omit<RecommendationEventInsert, "user_id">
  ): Promise<RecommendationEventRow> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("recommendation_events")
      .insert({ ...event, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Only a `pending` event can transition (see supabase/migrations/
  // 20260720000005_recommendation_events.sql and lib/intelligence/
  // recommendations/feedback.ts's isValidStatusTransition, which documents
  // the same rule this enforces atomically). The `eq("status", "pending")`
  // guard means a stale or already-responded event simply matches zero
  // rows rather than racing a read-then-write — ownership is enforced the
  // same way as lib/db/goals.ts's toggleMilestone, via the user_id filter.
  async recordOutcome(
    userId: string,
    eventId: string,
    status: RecommendationStatus
  ): Promise<RecommendationEventRow | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("recommendation_events")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", eventId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async list(userId: string, limit = 200): Promise<RecommendationEventRow[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("recommendation_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },
};
