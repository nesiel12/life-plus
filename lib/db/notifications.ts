import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import type { DraftNotification, NotificationChannel } from "@/lib/proactive/types";

const repo = createUserScopedRepo("notifications");

export const notificationsRepo = {
  ...repo,

  /** The user's queue for the notification centre — newest actionable first. */
  list: (userId: string) =>
    repo.list(userId, { orderBy: "scheduled_for", ascending: false }),

  /**
   * Insert a drafted notification. Returns null if the (user_id, dedupe_key)
   * unique index rejects it — i.e. this exact nudge already exists today, which
   * is a success, not an error.
   */
  async create(draft: DraftNotification, channels: NotificationChannel[]) {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .insert({
        user_id: draft.userId,
        kind: draft.kind,
        title: draft.title,
        body: draft.body,
        reason: draft.reason ?? null,
        action: draft.action ? (draft.action as unknown as Record<string, unknown>) : null,
        channels,
        dedupe_key: draft.dedupeKey,
        scheduled_for: (draft.scheduledFor ?? new Date()).toISOString(),
        expires_at: draft.expiresAt ? draft.expiresAt.toISOString() : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") return null; // duplicate dedupe_key — already queued
      throw error;
    }
    return data;
  },

  async markStatus(
    userId: string,
    id: string,
    status: "sent" | "read" | "acted" | "dismissed" | "expired"
  ) {
    const stamp: Record<string, string> = {};
    if (status === "sent") stamp.sent_at = new Date().toISOString();
    if (status === "read") stamp.read_at = new Date().toISOString();
    if (status === "acted") stamp.acted_at = new Date().toISOString();
    return repo.update(userId, id, { status, ...stamp });
  },
};
