import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

type ProgramRow = Database["public"]["Tables"]["recovery_programs"]["Row"];
type ProgramInsert = Database["public"]["Tables"]["recovery_programs"]["Insert"];
type ProgramUpdate = Database["public"]["Tables"]["recovery_programs"]["Update"];
type EventRow = Database["public"]["Tables"]["recovery_events"]["Row"];
type CredentialRow = Database["public"]["Tables"]["recovery_credentials"]["Row"];

// Recovery data access.
//
// Deliberately NOT built on createUserScopedRepo and deliberately NOT part of
// the app's bootstrap fan-out: nothing here should ever load "by default"
// alongside the rest of the app's state. Every read is behind an explicit
// unlock (lib/recovery/lock.ts), and keeping these queries in their own
// module makes that boundary visible rather than a convention someone can
// forget.

export const recoveryProgramsRepo = {
  async list(userId: string): Promise<ProgramRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_programs")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async get(userId: string, id: string): Promise<ProgramRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_programs")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(userId: string, input: Omit<ProgramInsert, "user_id">): Promise<ProgramRow> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_programs")
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(userId: string, id: string, patch: ProgramUpdate): Promise<ProgramRow> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_programs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Archive rather than delete.
   *
   * Someone stepping away from a program has not necessarily decided their
   * history should cease to exist, and a hard delete of a year of recovery
   * data behind one tap is not a choice worth offering casually. A separate,
   * explicit purge exists for when they really do mean it.
   */
  async archive(userId: string, id: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("recovery_programs")
      .update({ archived_at: new Date().toISOString(), is_active: false })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  },

  /** Irreversible, and only from an explicit confirmation. */
  async purge(userId: string, id: string): Promise<void> {
    // recovery_events cascades on the FK, so this takes the log with it.
    const { error } = await getSupabaseClient()
      .from("recovery_programs")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  },

  /** Every active program across all users — for the risk-hour support job. */
  async listActiveForUser(userId: string): Promise<ProgramRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_programs")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("archived_at", null);
    if (error) throw error;
    return data ?? [];
  },
};

export const recoveryEventsRepo = {
  async listForProgram(userId: string, programId: string, limit = 200): Promise<EventRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_events")
      .select("*")
      .eq("user_id", userId)
      .eq("program_id", programId)
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async create(
    userId: string,
    input: {
      program_id: string;
      kind: "relapse" | "urge" | "note";
      occurred_at?: string;
      intensity?: number | null;
      trigger?: string | null;
      note?: string | null;
    }
  ): Promise<EventRow> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_events")
      .insert({ ...input, user_id: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async remove(userId: string, id: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("recovery_events")
      .delete()
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  },
};

export const recoveryCredentialsRepo = {
  async listForUser(userId: string): Promise<CredentialRow[]> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_credentials")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },

  async findByCredentialId(credentialId: string): Promise<CredentialRow | null> {
    const { data, error } = await getSupabaseClient()
      .from("recovery_credentials")
      .select("*")
      .eq("credential_id", credentialId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async create(input: {
    user_id: string;
    credential_id: string;
    public_key: string;
    counter: number;
    transports: string[];
    device_label?: string | null;
  }): Promise<void> {
    const { error } = await getSupabaseClient().from("recovery_credentials").insert(input);
    if (error) throw error;
  },

  async updateCounter(credentialId: string, counter: number): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("recovery_credentials")
      .update({ counter, last_used_at: new Date().toISOString() })
      .eq("credential_id", credentialId);
    if (error) throw error;
  },

  async remove(userId: string, credentialId: string): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("recovery_credentials")
      .delete()
      .eq("user_id", userId)
      .eq("credential_id", credentialId);
    if (error) throw error;
  },
};

/** Challenges expire fast; one outstanding per user is enough. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const recoveryChallengesRepo = {
  async put(userId: string, challenge: string, purpose: "register" | "authenticate"): Promise<void> {
    const { error } = await getSupabaseClient()
      .from("recovery_challenges")
      .upsert(
        {
          user_id: userId,
          challenge,
          purpose,
          expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
        },
        { onConflict: "user_id" }
      );
    if (error) throw error;
  },

  /**
   * Reads and immediately consumes the challenge.
   *
   * Single-use by construction: a challenge that could be replayed is not a
   * challenge, so it is deleted whether or not the verification that follows
   * succeeds.
   */
  async take(userId: string, purpose: "register" | "authenticate"): Promise<string | null> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("recovery_challenges")
      .select("challenge, purpose, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;

    await client.from("recovery_challenges").delete().eq("user_id", userId);

    if (!data) return null;
    if (data.purpose !== purpose) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.challenge;
  },
};
