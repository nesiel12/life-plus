import "server-only";
import { getSupabaseClient } from "@/lib/supabase";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("manual_events");

/**
 * How late a missed reminder may still be delivered.
 *
 * Without a floor, a sweep that didn't run (deploy, outage, a cron the user
 * hadn't enabled yet) would come back and fire reminders for events that
 * already happened. Two hours is long enough to survive a normal gap and
 * short enough that "your event starts soon" is still true.
 */
const REMINDER_GRACE_MS = 2 * 60 * 60 * 1000;

export const manualEventsRepo = {
  ...repo,
  // Ascending, unlike most other repos' newest-first default — this is
  // calendar data, so chronological order is what every consumer actually
  // wants (the Timeline's own sort is a secondary, per-day pass on top).
  list: (userId: string) => repo.list(userId, { orderBy: "start_time", ascending: true }),

  /**
   * Events whose reminder window has opened and which have not been reminded.
   *
   * The window test can't be expressed in PostgREST (it compares a column
   * against another column offset by a third), so the coarse bounds are
   * pushed to the database and the exact `start - reminder_minutes <= now`
   * check happens in the caller. The partial index added in
   * 20260907000000 keeps that coarse query cheap.
   */
  async listRemindable(userId: string, now: Date) {
    const { data, error } = await getSupabaseClient()
      .from("manual_events")
      .select("*")
      .eq("user_id", userId)
      .not("reminder_minutes", "is", null)
      .is("reminded_at", null)
      .gte("start_time", new Date(now.getTime() - REMINDER_GRACE_MS).toISOString())
      // Nothing can be due more than a day of lead time out, and the longest
      // reminder anyone sets is well under that.
      .lte("start_time", new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .order("start_time", { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  /**
   * Claims an event for reminding, exactly once.
   *
   * The conditional `reminded_at is null` is the whole idempotency guarantee:
   * two overlapping sweeps both see the event, both try to claim it, and
   * exactly one gets a row back. Returns false for the loser, which then
   * skips it rather than sending a duplicate.
   */
  async markReminded(userId: string, id: string): Promise<boolean> {
    const { data, error } = await getSupabaseClient()
      .from("manual_events")
      .update({ reminded_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", id)
      .is("reminded_at", null)
      .select("id");

    if (error) throw error;
    return (data?.length ?? 0) > 0;
  },
};
