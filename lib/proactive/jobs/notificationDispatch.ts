import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { getUserById } from "@/lib/db/users";
import { sendEmail } from "@/lib/notify/channels/email";
import { canSendNow, isUnderDailyCap } from "@/lib/proactive/schedule";
import { localHourIn, resolveUserTimezone, startOfLocalDay } from "@/lib/proactive/timezone";
import type { Job, NotificationAction } from "@/lib/proactive/types";

/** Give up on a notification after this many failed sends. */
const MAX_ATTEMPTS = 3;

interface DeliveryRecord {
  attempts?: number;
}

/**
 * Delivers queued notifications over their outbound channels.
 *
 * This is the half of notification delivery that `notify()` deliberately does
 * not do. Splitting them is what finally makes three things work that were
 * written in M2 and never wired up:
 *
 *  - **Quiet hours.** `canSendNow` existed and nothing called it. A nightly
 *    job emailed at 03:00.
 *  - **The daily cap.** `isUnderDailyCap` existed and nothing called it, and
 *    `countSentSince` reads `sent_at`, which nothing ever stamped.
 *  - **Retry.** A send that failed inside the producing job was simply lost,
 *    and that job's idempotency key then prevented it ever being retried.
 *
 * Self-ledgered: it runs on every sweep, and its idempotency is `sent_at` on
 * the row rather than a per-day job_runs entry.
 */
export const notificationDispatchJob: Job = {
  name: "notification_dispatch",
  scope: "per_user",
  ledger: "self",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const prefs = await notificationPreferencesRepo.get(userId);
    if (!prefs.channelEmail) {
      // In-app notifications still exist; there is simply nothing to send.
      return { itemsProduced: 0, detail: { skipped: "email_disabled" } };
    }

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);

    if (!canSendNow(localHourIn(now, timeZone), prefs)) {
      // Everything stays queued with its scheduled_for intact and goes out on
      // a later sweep. Quiet hours defer delivery; they never drop it.
      return { itemsProduced: 0, detail: { skipped: "quiet_hours" } };
    }

    const due = await notificationsRepo.listDueOutbound(userId, now);
    if (due.length === 0) return { itemsProduced: 0 };

    const user = await getUserById(userId);
    if (!user?.email) return { itemsProduced: 0, detail: { skipped: "no_email_address" } };

    let sentToday = await notificationsRepo.countSentSince(
      userId,
      startOfLocalDay(now, timeZone).toISOString()
    );

    let sent = 0;
    let failed = 0;
    let capped = 0;
    let skipped = 0;

    for (const row of due) {
      if (!isUnderDailyCap(sentToday, prefs)) {
        // The rest stay pending. They are not dropped — tomorrow's cap is
        // fresh, and anything genuinely time-bound carries an expires_at.
        capped = due.length - (sent + failed);
        break;
      }

      const result = await sendEmail({
        userId,
        toEmail: user.email,
        kind: row.kind,
        title: row.title,
        body: row.body,
        reason: row.reason ?? undefined,
        action: row.action as NotificationAction | null,
      });

      if (result.ok) {
        if (result.skipped) {
          // Email isn't configured on this deployment. Nothing was sent, so
          // nothing is recorded as sent — stamping sent_at here would mean
          // that the day someone adds RESEND_API_KEY, every notification
          // produced before then is permanently marked delivered. The
          // staleness floor in listDueOutbound is what stops the backlog
          // going out in one burst instead.
          skipped++;
          continue;
        }
        await notificationsRepo.recordDelivery(userId, row.id, "email", { status: "sent" });
        // Stamps sent_at, which is both the "already delivered" guard for the
        // next sweep and the input to the daily cap.
        await notificationsRepo.markStatus(userId, row.id, "sent");
        sentToday++;
        sent++;
        continue;
      }

      const previous = (row.delivery as Record<string, DeliveryRecord> | null)?.email;
      const attempts = (previous?.attempts ?? 0) + 1;
      // The row's own status stays `pending`: the in-app notification is
      // still valid and unread even when email is failing, and marking it
      // "sent" to get it out of the queue would be a lie the user can see.
      // `delivery.email.status === "failed"` is what listDueOutbound excludes.
      await notificationsRepo.recordDelivery(userId, row.id, "email", {
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        error: result.error,
        attempts,
      });
      failed++;
    }

    return {
      itemsProduced: sent,
      detail: { sent, failed, capped, skipped, due: due.length },
    };
  },
};
