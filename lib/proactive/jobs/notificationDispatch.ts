import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { getUserById } from "@/lib/db/users";
import { sendEmail } from "@/lib/notify/channels/email";
import { sendPush } from "@/lib/notify/channels/webpush";
import { sendWhatsApp } from "@/lib/notify/channels/whatsapp";
import { canSendNow, isUnderDailyCap } from "@/lib/proactive/schedule";
import {
  localHourIn,
  resolveUserTimezone,
  startOfLocalDay,
} from "@/lib/proactive/timezone";
import type {
  Job,
  NotificationAction,
  NotificationChannel,
  NotificationKind,
} from "@/lib/proactive/types";

/** Give up on a channel after this many failed sends. */
const MAX_ATTEMPTS = 3;

interface DeliveryRecord {
  status?: "sent" | "pending" | "failed";
  attempts?: number;
}

/**
 * Delivers queued notifications over their outbound channels (email, push,
 * whatsapp).
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
 * Each due row is fanned out over every channel it was queued for that the
 * user still has enabled — a row queued when email, push and whatsapp were
 * all on gets all three attempted every pass. The row is stamped `sent` (and
 * drops out of future passes) the moment ANY channel gets it out; a channel
 * that failed in the same pass simply doesn't get retried afterwards — the
 * in-app copy is still live and unread regardless, and "sent" means "the person was
 * reachably notified," not "every channel succeeded."
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
    const wantedChannels: NotificationChannel[] = [
      ...(prefs.channelEmail ? (["email"] as const) : []),
      ...(prefs.channelPush ? (["push"] as const) : []),
      // Mirrors resolveChannels()'s own condition (lib/proactive/schedule.ts)
      // exactly: a number alone or a toggle alone is not enough.
      ...(prefs.channelWhatsapp && prefs.whatsappNumber
        ? (["whatsapp"] as const)
        : []),
    ];
    if (wantedChannels.length === 0) {
      // In-app notifications still exist; there is simply nothing to send.
      return { itemsProduced: 0, detail: { skipped: "no_outbound_channel" } };
    }

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);

    if (!canSendNow(localHourIn(now, timeZone), prefs)) {
      // Everything stays queued with its scheduled_for intact and goes out on
      // a later sweep. Quiet hours defer delivery; they never drop it.
      return { itemsProduced: 0, detail: { skipped: "quiet_hours" } };
    }

    const due = await notificationsRepo.listDueOutbound(
      userId,
      now,
      wantedChannels,
    );
    if (due.length === 0) return { itemsProduced: 0 };

    // Only email needs the user's address resolved up front; push needs
    // nothing beyond the subscriptions sendPush already reads for itself.
    const user = wantedChannels.includes("email")
      ? await getUserById(userId)
      : null;

    let sentToday = await notificationsRepo.countSentSince(
      userId,
      startOfLocalDay(now, timeZone).toISOString(),
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

      const rowChannels = (row.channels ?? []) as NotificationChannel[];
      const delivery =
        (row.delivery as Record<string, DeliveryRecord> | null) ?? {};
      let deliveredAny = false;
      let attemptedAny = false;

      for (const channel of wantedChannels) {
        if (!rowChannels.includes(channel)) continue;
        const previous = delivery[channel];
        if (previous?.status === "failed" || previous?.status === "sent")
          continue;

        attemptedAny = true;

        const result = await (async () => {
          switch (channel) {
            case "email":
              return user?.email && !prefs.emailMutedKinds.includes(row.kind as NotificationKind)
                ? sendEmail({
                    userId,
                    toEmail: user.email,
                    kind: row.kind,
                    title: row.title,
                    body: row.body,
                    reason: row.reason ?? undefined,
                    action: row.action as NotificationAction | null,
                  })
                : ({ ok: true, skipped: true } as const);
            case "push":
              return sendPush({
                userId,
                kind: row.kind,
                title: row.title,
                body: row.body,
                action: row.action as NotificationAction | null,
              });
            case "whatsapp":
              return prefs.whatsappNumber
                ? sendWhatsApp({
                    toNumber: prefs.whatsappNumber,
                    kind: row.kind,
                    title: row.title,
                    body: row.body,
                    reason: row.reason ?? undefined,
                    action: row.action as NotificationAction | null,
                  })
                : ({ ok: true, skipped: true } as const);
            default:
              return { ok: true, skipped: true } as const;
          }
        })();

        if (result.ok) {
          if (result.skipped) {
            // This channel isn't usable (no email configured on this
            // deployment, no address on file, or no push subscription) —
            // nothing was sent, so nothing is recorded as sent for it.
            skipped++;
            continue;
          }
          await notificationsRepo.recordDelivery(userId, row.id, channel, {
            status: "sent",
          });
          deliveredAny = true;
          continue;
        }

        const attempts = (previous?.attempts ?? 0) + 1;
        // `delivery.<channel>.status === "failed"` is what listDueOutbound
        // excludes on the next pass for this specific channel.
        await notificationsRepo.recordDelivery(userId, row.id, channel, {
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          error: result.error,
          attempts,
        });
      }

      if (deliveredAny) {
        // Stamps sent_at, which is both the "already delivered" guard for
        // the next sweep and the input to the daily cap.
        await notificationsRepo.markStatus(userId, row.id, "sent");
        sentToday++;
        sent++;
      } else if (attemptedAny) {
        failed++;
      }
    }

    return {
      itemsProduced: sent,
      detail: { sent, failed, capped, skipped, due: due.length },
    };
  },
};
