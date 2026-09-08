import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";
import type { DraftNotification, NotificationChannel } from "@/lib/proactive/types";

const repo = createUserScopedRepo("notifications");

/**
 * How late a queued notification may still be emailed.
 *
 * Long enough to survive a scheduler outage or an overnight quiet-hours
 * deferral; short enough that "here is your morning briefing" never arrives
 * the following afternoon.
 */
const STALE_OUTBOUND_MS = 12 * 60 * 60 * 1000;

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
  async create(
    draft: DraftNotification,
    channels: NotificationChannel[],
    scheduledFor?: Date
  ) {
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
        // Resolved by notify() against the user's quiet hours in their own
        // timezone, so a 03:00 nightly job queues an email for the morning
        // rather than sending one at 03:00.
        scheduled_for: (scheduledFor ?? draft.scheduledFor ?? new Date()).toISOString(),
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

  /**
   * The dispatcher's work queue: this user's notifications that are due, not
   * yet sent, and want an outbound channel.
   *
   * `sent_at IS NULL` rather than only `status = 'pending'` because a failed
   * send leaves the row pending for retry — the timestamp is what actually
   * records "this one already went out".
   */
  async listDueOutbound(userId: string, now: Date, limit = 20) {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .is("sent_at", null)
      .lte("scheduled_for", now.toISOString())
      // Stale notifications are not worth sending. Before the dispatcher
      // existed, every notification the engine ever produced sat here
      // `pending` forever — so without this floor, the first dispatcher run
      // on any existing deployment would email the entire backlog at once,
      // starting with a daily insight from weeks ago. The in-app copy stays
      // in the centre either way; only the email is skipped.
      .gte("scheduled_for", new Date(now.getTime() - STALE_OUTBOUND_MS).toISOString())
      .contains("channels", ["email"])
      // Rows whose email attempts are exhausted drop out of the queue without
      // being dishonestly stamped as sent. The in-app notification is still
      // live and unread; only the email gave up.
      .or("delivery->email->>status.is.null,delivery->email->>status.neq.failed")
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  /**
   * Records what happened on one channel for one notification.
   *
   * Read-modify-write on the jsonb rather than a `jsonb_set` RPC: at this
   * volume (a handful of notifications per user per day, one dispatcher) the
   * simpler form is not meaningfully racier, and the dispatcher flips
   * `status` off `pending` on success so a concurrent run's `listDueOutbound`
   * will not pick the same row up again.
   */
  async recordDelivery(
    userId: string,
    id: string,
    channel: NotificationChannel,
    outcome: { status: "sent" | "pending" | "failed"; error?: string; attempts?: number }
  ) {
    const client = getSupabaseClient();
    const { data: current, error: readError } = await client
      .from("notifications")
      .select("delivery")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;

    const delivery = { ...((current?.delivery as Record<string, unknown>) ?? {}) };
    delivery[channel] = {
      status: outcome.status,
      at: new Date().toISOString(),
      ...(outcome.error ? { error: outcome.error.slice(0, 500) } : {}),
      ...(outcome.attempts !== undefined ? { attempts: outcome.attempts } : {}),
    };

    const { error } = await client
      .from("notifications")
      .update({ delivery })
      .eq("user_id", userId)
      .eq("id", id);
    if (error) throw error;
  },

  /** One page of the notification centre, newest first. */
  async listPage(userId: string, options: { limit?: number; before?: string } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    let query = getSupabaseClient()
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      // Expired items are swept by recommendation_expiry and are, by
      // definition, no longer worth the user's attention.
      .neq("status", "expired")
      .order("created_at", { ascending: false })
      .limit(limit + 1); // one extra: its presence is the "there is more" signal

    if (options.before) query = query.lt("created_at", options.before);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { rows: page, nextCursor: hasMore ? page[page.length - 1].created_at : null };
  },

  /**
   * Recent notifications with their per-channel delivery outcome, for the
   * settings-page email diagnostics. Unlike listPage this keeps expired rows
   * and exposes `channels`/`delivery`/`sent_at` raw — the point is to show
   * why a message did or did not arrive.
   */
  async recentForDiagnostics(userId: string, limit = 8) {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .select("id, kind, title, created_at, scheduled_for, sent_at, status, channels, delivery")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 25));
    if (error) throw error;
    return data ?? [];
  },

  /** Badge count: everything queued or delivered that the user hasn't opened. */
  async countUnread(userId: string): Promise<number> {
    const { count, error } = await getSupabaseClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["pending", "sent"])
      .is("read_at", null);
    if (error) throw error;
    return count ?? 0;
  },

  async markAllRead(userId: string): Promise<number> {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .update({ status: "read", read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("status", ["pending", "sent"])
      .is("read_at", null)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  },

  /** Sweep pending notifications whose expires_at has passed → 'expired'. Returns the count. */
  async expireOverdue(userId: string): Promise<number> {
    const { data, error } = await getSupabaseClient()
      .from("notifications")
      .update({ status: "expired" })
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString())
      .not("expires_at", "is", null)
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  },

  /** How many proactive notifications have already gone out today (for the daily cap). */
  async countSentSince(userId: string, sinceIso: string): Promise<number> {
    const { count, error } = await getSupabaseClient()
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("sent_at", "is", null)
      .gte("sent_at", sinceIso);
    if (error) throw error;
    return count ?? 0;
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
