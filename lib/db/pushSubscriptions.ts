import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/types/database";

export type PushSubscriptionRow = Database["public"]["Tables"]["push_subscriptions"]["Row"];

export interface PushSubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}

export const pushSubscriptionsRepo = {
  async listForUser(userId: string): Promise<PushSubscriptionRow[]> {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return data ?? [];
  },

  /** Upsert by (user, endpoint) — re-subscribing the same browser refreshes
   *  the keys rather than piling up rows. */
  async save(userId: string, input: PushSubscriptionInput): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "user_id,endpoint" }
    );
    if (error) throw error;
  },

  async removeByEndpoint(userId: string, endpoint: string): Promise<void> {
    const client = getSupabaseClient();
    const { error } = await client
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint);
    if (error) throw error;
  },

  /** Used by the sender when a push service reports an endpoint is gone
   *  (404/410) — the subscription is dead and must not be retried. */
  async pruneDeadEndpoint(endpoint: string): Promise<void> {
    const client = getSupabaseClient();
    await client.from("push_subscriptions").delete().eq("endpoint", endpoint);
  },

  async touch(endpoint: string): Promise<void> {
    const client = getSupabaseClient();
    await client
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("endpoint", endpoint);
  },
};
