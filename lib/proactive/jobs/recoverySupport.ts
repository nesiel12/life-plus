import "server-only";
import { recoveryEventsRepo, recoveryProgramsRepo } from "@/lib/db/recovery";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { localDayIn, localHourIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { computeStreak, riskHoursFromEvents, type RecoveryEvent } from "@/lib/recovery/streak";
import { getLocalHour } from "@/lib/intelligence/personalDNA/timezone";
import type { Job } from "@/lib/proactive/types";

/**
 * How far ahead of a risk hour the message lands.
 *
 * Before, not during: the point is to arrive while there is still a choice
 * to make, not to interrupt someone mid-craving.
 */
const LEAD_HOURS = 1;

/**
 * Support that arrives before the hard part.
 *
 * Everything about the wording here is constrained by one fact: this arrives
 * on a lock screen, and the person may not be alone. So it never names the
 * program, never says what is being quit, and never uses a word that would
 * embarrass anyone who saw it over a shoulder. The specifics live behind the
 * biometric lock, where they belong.
 *
 * Risk hours come from what the user declared at setup, plus what their own
 * logged cravings actually show — the latter only once there is enough of it
 * to be a pattern rather than a coincidence.
 */
export const recoverySupportJob: Job = {
  name: "recovery_support",
  scope: "per_user",
  ledger: "self",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const programs = await recoveryProgramsRepo.listActiveForUser(userId);
    if (programs.length === 0) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const hour = localHourIn(now, timeZone);
    const localDay = localDayIn(now, timeZone);

    let produced = 0;

    for (const row of programs) {
      const events: RecoveryEvent[] = (
        await recoveryEventsRepo.listForProgram(userId, row.id)
      ).map((e) => ({
        id: e.id,
        kind: e.kind,
        occurredAt: e.occurred_at,
        intensity: e.intensity ?? undefined,
        trigger: e.trigger ?? undefined,
        note: e.note ?? undefined,
      }));

      // Declared hours plus learned ones. A user who never filled in risk
      // hours still gets support once their own log reveals a pattern.
      const learned = riskHoursFromEvents(events, (iso) => getLocalHour(iso, timeZone));
      const riskHours = new Set([...(row.risk_hours ?? []), ...learned]);
      if (riskHours.size === 0) continue;

      // Fire when the risk hour is LEAD_HOURS away, wrapping at midnight.
      const target = (hour + LEAD_HOURS) % 24;
      if (!riskHours.has(target)) continue;

      const program = {
        id: row.id,
        title: row.title,
        cleanSince: row.clean_since,
        reasons: row.reasons ?? [],
        triggers: row.triggers ?? [],
        riskHours: row.risk_hours ?? [],
        copingStrategies: row.coping_strategies ?? [],
        celebratedMilestones: row.celebrated_milestones ?? [],
        isActive: row.is_active,
        createdAt: row.created_at,
      };
      const streak = computeStreak(program, events, now);

      const outcome = await notify({
        userId,
        kind: "recovery_support",
        // Deliberately anodyne. Anyone reading this over a shoulder learns
        // nothing beyond "the app is checking in".
        title: "בדיקה קצרה",
        body:
          streak.currentDays > 0
            ? `${streak.currentDays} ימים ברצף. אם השעה הקרובה קשה — הכל מחכה לך במרחב האישי.`
            : "אם השעה הקרובה קשה — הכל מחכה לך במרחב האישי.",
        reason: "על סמך השעות שסימנת כקשות",
        action: { type: "open_route", payload: { route: "/areas/recovery" } },
        // Once per program per day, however often the sweep runs.
        dedupeKey: buildDedupeKey("recovery_support", row.id, localDay),
        // Pointless after the window it was about.
        expiresAt: new Date(now.getTime() + (LEAD_HOURS + 2) * 3_600_000),
        // The user picked these hours themselves; holding the message for
        // quiet hours would deliver it after the moment it was for.
        scheduledFor: now,
      });

      if (outcome.created) produced++;
    }

    return { itemsProduced: produced, detail: { programs: programs.length } };
  },
};
