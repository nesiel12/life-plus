import "server-only";
import { manualEventsRepo } from "@/lib/db/manual-events";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { getCalendarAccessTokenForUser } from "@/lib/googleCalendar/serverAccess";
import { fetchAllCalendarsWindow } from "@/lib/googleCalendar/fetchWindow";
import { recommendationEventsRepo } from "@/lib/db/recommendationEvents";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import { endOfLocalDay, localDayIn, resolveUserTimezone, startOfLocalDay } from "@/lib/proactive/timezone";
import type { Job } from "@/lib/proactive/types";

const HORIZON_DAYS = 7;

/** Above this many hours booked, a day is worth flagging. */
const HEAVY_DAY_HOURS = 8;

/** Or above this many separate commitments, however short each one is. */
const HEAVY_DAY_EVENTS = 6;

export interface DayLoad {
  day: string;
  events: number;
  hours: number;
}

/** Pure: which of the coming days are overloaded, heaviest first. */
export function findHeavyDays(loads: DayLoad[]): DayLoad[] {
  return loads
    .filter((load) => load.hours >= HEAVY_DAY_HOURS || load.events >= HEAVY_DAY_EVENTS)
    .sort((a, b) => b.hours - a.hours || b.events - a.events);
}

export function describeHeavyDay(load: DayLoad, timeZone: string): string {
  const label = new Date(`${load.day}T12:00:00Z`).toLocaleDateString("he-IL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const hours = Math.round(load.hours);
  return `${label} — ${load.events} אירועים, כ-${hours} שעות מתוזמנות`;
}

/**
 * Looks a week ahead and says so when it is heavy.
 *
 * Proposal only, per the app's Approve/Modify rule: it never moves anything.
 * The attached action opens Time & Tasks, where the user decides what to
 * reschedule. A linked recommendation_events row keeps the existing
 * accept/reject feedback loop working, so repeatedly-ignored warnings lose
 * weight in ranking instead of nagging forever.
 */
export const busyWeekScanJob: Job = {
  name: "busy_week_scan",
  scope: "per_user",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);

    const from = startOfLocalDay(now, timeZone);
    const to = new Date(endOfLocalDay(now, timeZone).getTime() + (HORIZON_DAYS - 1) * 86_400_000);

    const accessToken = await getCalendarAccessTokenForUser(userId);
    if (!accessToken) {
      // Without the calendar this scan has almost nothing to reason about —
      // manual events alone would flag a "busy week" off two entries.
      return { itemsProduced: 0, detail: { reason: "calendar_not_connected" } };
    }

    let events;
    try {
      events = await fetchAllCalendarsWindow(accessToken, from, to);
    } catch (err) {
      console.error(`[busy_week_scan] calendar read failed for ${userId}:`, err);
      return { itemsProduced: 0, detail: { reason: "calendar_read_failed" } };
    }

    const manual = await manualEventsRepo.list(userId);

    const byDay = new Map<string, DayLoad>();
    const add = (startIso: string, endIso: string, isAllDay: boolean) => {
      const day = isAllDay ? startIso.slice(0, 10) : localDayIn(new Date(startIso), timeZone);
      if (day < localDayIn(from, timeZone) || day > localDayIn(to, timeZone)) return;
      const load = byDay.get(day) ?? { day, events: 0, hours: 0 };
      load.events++;
      if (!isAllDay) {
        const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
        // An all-day event contributes a commitment but not hours — counting
        // it as 24 would make every week with a birthday on it "busy".
        if (Number.isFinite(ms) && ms > 0) load.hours += ms / 3_600_000;
      }
      byDay.set(day, load);
    };

    for (const event of events) add(event.start, event.end, event.isAllDay);
    for (const event of manual) {
      if (event.start_time >= from.toISOString() && event.start_time <= to.toISOString()) {
        add(event.start_time, event.end_time, false);
      }
    }

    const heavy = findHeavyDays([...byDay.values()]);
    if (heavy.length === 0) return { itemsProduced: 0, detail: { reason: "week_looks_fine" } };

    const worst = heavy[0];
    const weekStart = localDayIn(from, timeZone);

    // Linked so the existing accept/reject weighting keeps working — a
    // warning the user ignores every week should lose influence, not repeat
    // at full volume forever.
    const recommendationEventId = await recommendationEventsRepo
      .create(userId, {
        type: "busy_week_scan",
        source: "proactive_busy_week_scan",
        recommendation_payload: { weekStart, heavy: heavy.slice(0, 3) },
      })
      .then((row) => row.id)
      .catch(() => null);

    const body =
      heavy.length === 1
        ? `${describeHeavyDay(worst, timeZone)}. שווה להסתכל מה אפשר להזיז או לקצר.`
        : `${heavy.length} ימים עמוסים לפניך. הכי עמוס: ${describeHeavyDay(worst, timeZone)}.`;

    const outcome = await notify({
      userId,
      kind: "busy_week",
      title: "שבוע עמוס לפניך",
      body,
      reason: "על סמך היומן שלך לשבוע הקרוב",
      action: {
        type: "reschedule_tasks",
        payload: { date: worst.day, recommendationEventId },
      },
      // One warning per week, not per scan.
      dedupeKey: buildDedupeKey("busy_week", weekStart, weekStart),
    });

    return {
      itemsProduced: outcome.created ? 1 : 0,
      detail: { heavyDays: heavy.length, worst: worst.day, notified: outcome.created },
    };
  },
};
