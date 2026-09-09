import "server-only";
import { notificationsRepo } from "@/lib/db/notifications";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { getUserById } from "@/lib/db/users";
import { sendEmail } from "@/lib/notify/channels/email";
import { sendPush } from "@/lib/notify/channels/webpush";
import { canSendNow, isUnderDailyCap } from "@/lib/proactive/schedule";
import { localHourIn, resolveUserTimezone, startOfLocalDay } from "@/lib/proactive/timezone";
import type { Job, NotificationAction, NotificationChannel } from "@/lib/proactive/types";

/** Give up on a notification after this many failed sends. */
const MAX_ATTEMPTS = 3;

interface DeliveryRecord {
  attempts?: number;
  status?: string;
}

/**
 * Delivers queued notifications over their outbound channels (email + Web
 * Push).
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
    const wanted: NotificationChannel[] = [];
    if (prefs.channelEmail) wanted.push("email");
    if (prefs.channelPush) wanted.push("push");
    if (wanted.length === 0) {
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

    const due = await notificationsRepo.listDueOutbound(userId, now, wanted);
    if (due.length === 0) return { itemsProduced: 0 };

    const user = await getUserById(userId);

    let sentToday = await notificationsRepo.countSentSince(
      userId,
      startOfLocalDay(now, timeZone).toISOString()
    );

    let sent = 0;
    let failed = 0;
    let pushed = 0;
    let capped = 0;
    let skipped = 0;

    for (const row of due) {
      if (!isUnderDailyCap(sentToday, prefs)) {
        // The rest stay pending. They are not dropped — tomorrow's cap is
        // fresh, and anything genuinely time-bound carries an expires_at.
        capped = due.length - (sent + failed);
        break;
      }

      const rowChannels = (row.channels as NotificationChannel[]) ?? [];
      const delivery = row.delivery as Record<string, DeliveryRecord> | null;
      // Whether a channel is still worth attempting on this row.
      const viable = (ch: "email" | "push") =>
        wanted.includes(ch) && rowChannels.includes(ch) && delivery?.[ch]?.status !== "failed" && delivery?.[ch]?.status !== "sent";

      let rowDelivered = false;
      let rowTerminal = true; // every viable channel reached a terminal state
      let attempted = false; // at least one channel actually tried to send

      // ── Email ──────────────────────────────────────────────────────────
      if (viable("email") && user?.email) {
        attempted = true;
        const result = await sendEmail({
          userId,
          toEmail: user.email,
          kind: row.kind,
          title: row.title,
          body: row.body,
          reason: row.reason ?? undefined,
          action: row.action as NotificationAction | null,
          notificationId: row.id,
        });

        if (result.ok && result.skipped) {
          // Email isn't configured on this deployment. Nothing recorded, and
          // the row is not terminal on this channel — the day someone adds
          // RESEND_API_KEY it should still go (the staleness floor bounds it).
          rowTerminal = false;
          skipped++;
        } else if (result.ok) {
          await notificationsRepo.recordDelivery(userId, row.id, "email", { status: "sent" });
          rowDelivered = true;
          sent++;
        } else {
          const attempts = (delivery?.email?.attempts ?? 0) + 1;
          const done = attempts >= MAX_ATTEMPTS;
          await notificationsRepo.recordDelivery(userId, row.id, "email", {
            status: done ? "failed" : "pending",
            error: result.error,
            attempts,
          });
          if (!done) rowTerminal = false;
          failed++;
        }
      } else if (viable("email")) {
        // Enabled + on the row, but the user has no email address on file.
        rowTerminal = false;
      }

      // ── Web Push ───────────────────────────────────────────────────────
      if (viable("push")) {
        attempted = true;
        const result = await sendPush({
          userId,
          title: row.title,
          body: row.body,
          kind: row.kind,
          action: row.action as NotificationAction | null,
        });

        if (result.ok && result.skipped) {
          // No VAPID keys, or no live subscription — not a failure, not
          // terminal. Leave it for a later sweep once a device subscribes.
          rowTerminal = false;
        } else if (result.ok) {
          await notificationsRepo.recordDelivery(userId, row.id, "push", { status: "sent" });
          rowDelivered = true;
          pushed++;
        } else {
          const attempts = (delivery?.push?.attempts ?? 0) + 1;
          const done = attempts >= MAX_ATTEMPTS;
          await notificationsRepo.recordDelivery(userId, row.id, "push", {
            status: done ? "failed" : "pending",
            error: result.error,
            attempts,
          });
          if (!done) rowTerminal = false;
        }
      }

      // Stamp the row done — out of the outbound queue, counted against the
      // cap — once it has actually gone out somewhere, or once every viable
      // channel has permanently given up (so it stops being re-fetched).
      if (rowDelivered || (attempted && rowTerminal)) {
        await notificationsRepo.markStatus(userId, row.id, "sent");
        if (rowDelivered) sentToday++;
      }
    }

    return {
      itemsProduced: sent + pushed,
      detail: { sent, pushed, failed, capped, skipped, due: due.length },
    };
  },
};
