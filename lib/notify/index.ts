import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { resolveChannels } from "@/lib/proactive/schedule";
import { nextSendTime, resolveUserTimezone } from "@/lib/proactive/timezone";
import type { DraftNotification } from "@/lib/proactive/types";

export interface NotifyOutcome {
  created: boolean; // false when deduped (already queued today) or the kind is muted
  channels: string[];
  /** When an outbound send may happen. Now, unless quiet hours defer it. */
  scheduledFor?: Date;
}

/**
 * The one entry point for the Proactive Engine to reach a user.
 *
 * Resolves channel preferences, works out when an outbound send is actually
 * allowed, and persists the notification (dedupe-safe). In-app delivery is
 * implicit — persisting the row *is* the in-app delivery; the notification
 * centre reads the queue.
 *
 * It deliberately does NOT send anything. Delivery is
 * lib/proactive/jobs/notificationDispatch.ts, for two reasons the previous
 * inline `Promise.allSettled` fan-out could not handle:
 *
 *  1. Quiet hours. `canSendNow` and `isUnderDailyCap` have existed in
 *     lib/proactive/schedule.ts since M2 and were never called by anything.
 *     A nightly job at 03:00 emailed at 03:00. Deferring means writing a
 *     future `scheduled_for` and having something come back for it later —
 *     which is a dispatcher.
 *  2. Retry. An email that fails inside the producing job is simply lost;
 *     the job's idempotency key then stops it ever being retried. Recording
 *     the attempt on the row and re-reading due rows next sweep is what makes
 *     a transient provider outage survivable.
 */
export async function notify(draft: DraftNotification): Promise<NotifyOutcome> {
  const prefs = await notificationPreferencesRepo.get(draft.userId);
  const channels = resolveChannels(draft.kind, prefs);

  if (channels.length === 0) {
    return { created: false, channels: [] }; // kind is muted — not even in-app
  }

  // An explicit scheduledFor from the caller wins: a job that means "surface
  // this at 18:00" is not asking about quiet hours, it is stating a time.
  let scheduledFor = draft.scheduledFor;
  if (!scheduledFor) {
    const dna = await personalDnaRepo.get(draft.userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    scheduledFor = nextSendTime(new Date(), timeZone, prefs.quietHoursStart, prefs.quietHoursEnd);
  }

  const row = await notificationsRepo.create(draft, channels, scheduledFor);
  if (!row) {
    return { created: false, channels }; // deduped — this nudge already exists today
  }

  return { created: true, channels, scheduledFor };
}
