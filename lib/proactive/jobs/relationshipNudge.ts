import "server-only";
import { peopleRepo } from "@/lib/db/people";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { localDayIn, localHourIn, resolveUserTimezone } from "@/lib/proactive/timezone";
import { describeNeglect, findNeglected, type NeglectCandidate } from "@/lib/family/neglect";
import type { Job } from "@/lib/proactive/types";

/**
 * The earliest local hour this is worth sending.
 *
 * "Call your grandmother" at 06:00 is not actionable; by late morning it is.
 */
const EARLIEST_LOCAL_HOUR = 10;

/**
 * One relationship nudge a day, at most.
 *
 * The family CRM has recorded `last_meaningful_interaction` since it was
 * built and nothing ever acted on it — the `reminder_family` notification
 * kind was declared in M2 with no producer. This is the producer.
 *
 * Deliberately one person, not a list. A digest of five people you have
 * neglected is a guilt report, and the reliable response to a guilt report is
 * to stop opening it. One name is something you can act on before lunch.
 */
export const relationshipNudgeJob: Job = {
  name: "relationship_nudge",
  scope: "per_user",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const hour = localHourIn(now, timeZone);

    if (hour < EARLIEST_LOCAL_HOUR) {
      // Re-claimable: a later invocation today will pick it up.
      return { itemsProduced: 0, status: "skipped", detail: { hour } };
    }

    const rows = await peopleRepo.list(userId);
    if (rows.length === 0) return { itemsProduced: 0 };

    const candidates: NeglectCandidate[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      hebrewName: row.hebrew_name ?? undefined,
      relation: row.relation,
      phone: row.phone ?? undefined,
      lastMeaningfulInteraction: row.last_meaningful_interaction ?? undefined,
      birthday: row.birthday ?? undefined,
      createdAt: row.created_at,
    }));

    const [top] = findNeglected(candidates, now, { limit: 1 });
    if (!top) return { itemsProduced: 0, detail: { reason: "nobody_overdue" } };

    const localDay = localDayIn(now, timeZone);
    const name = top.person.hebrewName ?? top.person.name;

    const outcome = await notify({
      userId,
      kind: "reminder_family",
      title: describeNeglect(top),
      body:
        top.birthdayInDays !== undefined
          ? `שווה להקדים ולברך את ${name}.`
          : `הודעה קצרה ל${name} תיקח דקה, וההודעה כבר מוכנה במרחב המשפחה.`,
      reason: top.birthdayInDays !== undefined ? "על סמך תאריך יום ההולדת" : "על סמך מתי דיברתם לאחרונה",
      action: { type: "mark_contacted", payload: { personId: top.person.id } },
      // Keyed on the person, so a different person tomorrow still gets
      // through while the same person today does not repeat.
      dedupeKey: buildDedupeKey("reminder_family", top.person.id, localDay),
      expiresAt: new Date(now.getTime() + 2 * 86_400_000),
    });

    return {
      itemsProduced: outcome.created ? 1 : 0,
      detail: { person: top.person.id, daysSince: top.daysSince, notified: outcome.created },
    };
  },
};
