import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import { getSupabaseClient } from "@/lib/supabase";
import type { AudioEntityTypeDb, Database } from "@/types/database";

type AudioRow = Database["public"]["Tables"]["entity_audio"]["Row"];
type AudioUpdate = Database["public"]["Tables"]["entity_audio"]["Update"];

const base = createUserScopedRepo("entity_audio");

export const entityAudioRepo = {
  ...base,

  /** Everything attached to one entity, newest first. */
  async listForEntity(userId: string, entityType: AudioEntityTypeDb, entityId: string): Promise<AudioRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("entity_audio")
      .select("*")
      .eq("user_id", userId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /** How many recordings each entity of one kind has — for list badges. */
  async countsByEntity(userId: string, entityType: AudioEntityTypeDb): Promise<Map<string, number>> {
    const { data, error } = await getSupabaseClient()
      .from("entity_audio")
      .select("entity_id")
      .eq("user_id", userId)
      .eq("entity_type", entityType);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of data ?? []) counts.set(row.entity_id, (counts.get(row.entity_id) ?? 0) + 1);
    return counts;
  },

  /**
   * Takes the transcription lease, atomically.
   *
   * Same contract as lessonsRepo.claimStep: the transcribe request, an open
   * page's polling and the cron sweep can all be trying at once, and exactly
   * one of them may hold the step. `userId` may be null for the sweep.
   */
  async claimStep(audioId: string, userId: string | null, leaseSeconds: number): Promise<AudioRow | null> {
    const { data, error } = await getSupabaseClient().rpc("claim_audio_step", {
      p_audio_id: audioId,
      p_user_id: userId,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async listClaimable(limit: number): Promise<{ id: string; user_id: string }[]> {
    const { data, error } = await getSupabaseClient().rpc("list_claimable_audio", { p_limit: limit });
    if (error) throw error;
    return data ?? [];
  },

  /** Writes a step's result and releases the lease in one update. */
  async release(userId: string, audioId: string, patch: AudioUpdate): Promise<AudioRow> {
    return base.update(userId, audioId, { ...patch, lease_until: null });
  },
};
