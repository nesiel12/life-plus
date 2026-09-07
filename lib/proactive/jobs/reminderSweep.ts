import "server-only";
import { manualEventsRepo } from "@/lib/db/manual-events";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { localDayIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { formatLocalTime } from "@/lib/proactive/jobs/morningBriefing.format";
import type { Job } from "@/lib/proactive/types";

/** Pure: has this event entered its reminder window? */
export function isReminderDue(
  event: { start_time: string; reminder_minutes: number | null },
  now: Date
): boolean {
  if (event.reminder_minutes === null) return false;
  const start = new Date(event.start_time).getTime();
  if (!Number.isFinite(start)) return false;
  const fireAt = start - event.reminder_minutes * 60_000;
  // Only once the window has opened, and never after the event has started —
  // "your event starts in 15 minutes" about something already underway is
  // worse than silence.
  return now.getTime() >= fireAt && now.getTime() < start;
}

/**
 * Fires the reminders users have already asked for.
 *
 * `manual_events.reminder_minutes` has existed since migration
 * 20260726000005 with nothing whatsoever consuming it — the app let people
 * set a reminder and then never sent one. This is the consumer.
 *
 * Self-ledgered: it runs on every sweep, and its idempotency is the
 * conditional `reminded_at` claim rather than a per-day job_runs row.
 */
export const reminderSweepJob: Job = {
  name: "reminder_sweep",
  scope: "per_user",
  ledger: "self",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const candidates = await manualEventsRepo.listRemindable(userId, now);
    const due = candidates.filter((event) => isReminderDue(event, now));
    if (due.length === 0) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);

    let produced = 0;
    for (const event of due) {
      // Claim first, notify second. The other order would send the reminder
      // and then discover it had lost the race, having already emailed.
      const claimed = await manualEventsRepo.markReminded(userId, event.id);
      if (!claimed) continue;

      const minutes = event.reminder_minutes ?? 0;
      const startsAt = formatLocalTime(event.start_time, timeZone);

      const outcome = await notify({
        userId,
        kind: "reminder_event",
        title: minutes > 0 ? `בעוד ${minutes} דק׳: ${event.title}` : event.title,
        body: `האירוע "${event.title}" מתחיל ב-${startsAt}.`,
        reason:
          minutes > 0
            ? `הגדרת תזכורת ${minutes} דקות מראש`
            : "הגדרת תזכורת לאירוע הזה",
        action: { type: "open_route", payload: { route: "/calendar" } },
        dedupeKey: buildDedupeKey("reminder_event", event.id, localDayIn(now, timeZone)),
        // A reminder for an event that has started is noise. Expiring at the
        // start time means a delayed sweep drops it rather than sending it
        // late — the same judgement isReminderDue makes on the way in.
        expiresAt: new Date(event.start_time),
        // Reminders are the one kind that must not be deferred by quiet
        // hours: the user chose this time themselves, and a 06:00 flight
        // reminder held until 07:00 is a missed flight.
        scheduledFor: now,
      });

      if (outcome.created) produced++;
    }

    return { itemsProduced: produced, detail: { candidates: candidates.length, due: due.length } };
  },
};
