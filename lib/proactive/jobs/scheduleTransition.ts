import "server-only";
import { routineBlocksRepo } from "@/lib/db/routineBlocks";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { toRoutineBlock } from "@/lib/mappers";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { localDayIn, localHourIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import {
  ROUTINE_KIND_LABELS,
  formatDuration,
  formatMinute,
  freeWindows,
  transitionsDue,
} from "@/lib/schedule/routine";
import type { Job } from "@/lib/proactive/types";

/**
 * How wide a net each sweep casts.
 *
 * A scheduler does not fire on the second. This must be at least as long as
 * the gap between sweeps, or a transition whose alert moment fell between two
 * runs is never announced at all. Set to match the 15-minute sweep in
 * .github/workflows/proactive-sweep.yml; the per-block dedupe key is what
 * stops a wider window producing duplicates.
 */
const SWEEP_WINDOW_MINUTES = 15;

/**
 * "Training in 20 minutes."
 *
 * The nudge the daily schedule exists to produce: the app knowing what is
 * coming and saying so, without the user opening anything. Deliberately about
 * *transitions* rather than whole days — being told at 07:00 that you train at
 * 18:00 is a briefing; being told at 17:45 is useful.
 *
 * Self-ledgered: it runs every sweep, and its idempotency is the notification
 * dedupe key (kind + block + local day), so the same block cannot be announced
 * twice in one day however often the sweep runs.
 */
export const scheduleTransitionJob: Job = {
  name: "schedule_transition",
  scope: "per_user",
  ledger: "self",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const prefs = await notificationPreferencesRepo.get(userId);
    const lead = prefs.scheduleAlertMinutes;
    if (lead <= 0) {
      return { itemsProduced: 0, detail: { skipped: "transition_alerts_off" } };
    }

    const rows = await routineBlocksRepo.list(userId);
    if (rows.length === 0) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);

    // The user's own wall clock, which is the only clock a timetable is
    // written against.
    const localDay = localDayIn(now, timeZone);
    const hour = localHourIn(now, timeZone);
    const minuteOfHour = Number(
      new Intl.DateTimeFormat("en-US", { timeZone, minute: "numeric" }).format(now)
    );
    const minute = hour * 60 + minuteOfHour;
    const weekday = new Date(`${localDay}T12:00:00Z`).getUTCDay();

    const blocks = rows.map(toRoutineBlock);
    const due = transitionsDue(blocks, weekday, minute, lead, SWEEP_WINDOW_MINUTES);
    if (due.length === 0) return { itemsProduced: 0 };

    let produced = 0;
    for (const block of due) {
      const untilStart = block.startMinute - minute;

      // What follows the block matters as much as the block itself: "training
      // at 18:00, and you are free until 21:00 after it" is a plan, where
      // "training at 18:00" is only an alarm.
      const after = freeWindows(blocks, weekday, {
        fromMinute: block.endMinute,
        minDurationMinutes: 45,
      })[0];

      const outcome = await notify({
        userId,
        kind: "schedule_transition",
        title: `בעוד ${formatDuration(Math.max(untilStart, 1))}: ${block.title}`,
        body: [
          `${ROUTINE_KIND_LABELS[block.kind]} · ${formatMinute(block.startMinute)}–${formatMinute(block.endMinute)}.`,
          block.note,
          after
            ? `אחרי זה פנוי מ-${formatMinute(after.startMinute)} עד ${formatMinute(after.endMinute)}.`
            : null,
        ]
          .filter(Boolean)
          .join(" "),
        reason: "על סמך הלוז השבועי שלך",
        action: { type: "open_route", payload: { route: "/" } },
        dedupeKey: buildDedupeKey("schedule_transition", block.id, localDay),
        // Pointless once the block has started.
        expiresAt: new Date(now.getTime() + untilStart * 60_000),
        // Like event reminders, these must not be held by quiet hours: an
        // early-morning block is exactly the one worth being woken for, and
        // the user set the lead time themselves.
        scheduledFor: now,
      });

      if (outcome.created) produced++;
    }

    return { itemsProduced: produced, detail: { due: due.length, lead, timeZone } };
  },
};
