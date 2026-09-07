import "server-only";
import { buildAtlasContext } from "@/lib/context/buildAtlasContext";
import { buildIntelligenceSignals, rankSignals } from "@/lib/intelligence/core";
import { tasksRepo } from "@/lib/db/tasks";
import { manualEventsRepo } from "@/lib/db/manual-events";
import { dailyIntentionsRepo } from "@/lib/db/dailyIntentions";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { getUserById } from "@/lib/db/users";
import { generateChatText, isProviderConfigured } from "@/lib/ai";
import { systemActor } from "@/lib/ai/actor";
import { getCalendarAccessTokenForUser } from "@/lib/googleCalendar/serverAccess";
import { fetchAllCalendarsWindow } from "@/lib/googleCalendar/fetchWindow";
import { notify } from "@/lib/notify";
import { buildDedupeKey } from "@/lib/proactive/dedupe";
import {
  endOfLocalDay,
  localDayIn,
  localHourIn,
  resolveUserTimezone,
  startOfLocalDay,
} from "@/lib/proactive/timezone";
import {
  briefingReason,
  deterministicBriefing,
  formatBriefingInput,
  formatHebrewDate,
  selectBriefingParts,
  type BriefingEvent,
  type BriefingInput,
} from "@/lib/proactive/jobs/morningBriefing.format";
import type { Job } from "@/lib/proactive/types";

/** The user-local hour the briefing is for. */
const TARGET_LOCAL_HOUR = 7;

/**
 * The latest local hour at which sending a "morning" briefing still makes
 * sense. Past this, a cron backlog or a resumed deploy would deliver a
 * morning briefing in the afternoon, which is worse than not sending one.
 */
const LATEST_LOCAL_HOUR = 11;

const SYSTEM_PROMPT = `את/ה Life Plus — עוזר/ת אישי/ת פרואקטיבי/ת שמכיר/ה את המשתמש לעומק.
כתוב/י תדריך בוקר קצר בעברית טבעית וחמה, בגוף שני, 3–5 משפטים.
פתח/י בברכת בוקר. ציין/י את מה שבאמת קורה היום לפי הנתונים: אירועים בשעות שלהם,
ואז מה שכדאי לקדם. סיים/י בשאלה קצרה על הכוונה להיום.
התבסס/י אך ורק על הנתונים שסופקו. אל תמציא/י אירועים, שעות או משימות.
בלי כותרת, בלי רשימות, בלי אימוג'י — פסקה אחת רציפה.`;

/**
 * The flagship proactive job: one email and one in-app notification each
 * morning, saying what today actually holds.
 *
 * Self-gates on the user's local clock rather than being scheduled precisely.
 * Cron fires it from a few UTC-spaced runs; every invocation before the
 * user's 07:00 returns `status: "skipped"`, which jobRunsRepo.claim treats as
 * re-claimable. The first invocation at or after 07:00 does the work and
 * records "succeeded", and the unique index makes every later invocation that
 * day a no-op. That is what lets one cron schedule serve users in any
 * timezone without the scheduler knowing anything about them.
 */
export const morningBriefingJob: Job = {
  name: "morning_briefing",
  scope: "per_user",

  async run({ userId, now }) {
    if (!userId) return { itemsProduced: 0 };

    const dna = await personalDnaRepo.get(userId).catch(() => null);
    const timeZone = resolveUserTimezone(dna?.timezone);
    const localHour = localHourIn(now, timeZone);

    if (localHour < TARGET_LOCAL_HOUR) {
      return { itemsProduced: 0, status: "skipped", detail: { localHour, timeZone } };
    }
    if (localHour > LATEST_LOCAL_HOUR) {
      // Too late to be a morning briefing. Recorded as succeeded, not skipped,
      // so it stops being retried for the rest of the day.
      return { itemsProduced: 0, detail: { reason: "too_late", localHour, timeZone } };
    }

    const today = localDayIn(now, timeZone);

    // Real Google Calendar, read with the stored grant — no browser, no
    // cookie. A user who has never signed in since the grant table existed,
    // or whose grant was revoked, briefs on app-native data instead of
    // failing: an honest partial briefing beats none.
    let calendarEvents: BriefingEvent[] = [];
    let calendarConnected = false;
    const accessToken = await getCalendarAccessTokenForUser(userId);
    if (accessToken) {
      try {
        const window = await fetchAllCalendarsWindow(
          accessToken,
          startOfLocalDay(now, timeZone),
          endOfLocalDay(now, timeZone)
        );
        calendarEvents = window.map((e) => ({
          title: e.title,
          start: e.start,
          isAllDay: e.isAllDay,
        }));
        calendarConnected = true;
      } catch (err) {
        console.error(`[morning_briefing] calendar read failed for ${userId}:`, err);
      }
    }

    const [context, taskRows, manualEventRows, intention, user] = await Promise.all([
      buildAtlasContext(userId),
      tasksRepo.list(userId),
      manualEventsRepo.list(userId),
      dailyIntentionsRepo.getForToday(userId).catch(() => ""),
      getUserById(userId),
    ]);

    // Manual events are app-native calendar entries that were never synced to
    // Google, so they have to be merged in rather than assumed duplicated.
    const events: BriefingEvent[] = [
      ...calendarEvents,
      ...manualEventRows.map((m) => ({
        title: m.title,
        start: m.start_time,
        isAllDay: false,
      })),
    ];

    const ranked = rankSignals(buildIntelligenceSignals(context));

    const input: BriefingInput = {
      today,
      timeZone,
      greetingName: dna?.full_name ?? user?.hebrew_name ?? user?.name ?? undefined,
      events,
      tasks: taskRows
        .filter((t) => t.status !== "done")
        .map((t) => ({
          title: t.title,
          dueDate: t.due_date ?? undefined,
          isHighPriority: t.is_high_priority,
        })),
      relationshipNudge: context.relationshipSignals[0],
      topSignal: ranked[0]?.summary,
      intention: intention || undefined,
    };

    const parts = selectBriefingParts(input);

    let body: string;
    let aiUsed = false;
    if (isProviderConfigured()) {
      try {
        body = (
          await generateChatText({
            // Scheduled work the owner runs, not something this user asked
            // for — charging their free quota would let a daily job eat the
            // allowance they were about to use themselves.
            actor: systemActor("morning_briefing"),
            system: SYSTEM_PROMPT,
            prompt: `${formatBriefingInput(parts, input)}\n\nכתוב/י את תדריך הבוקר.`,
          })
        ).trim();
        aiUsed = Boolean(body);
      } catch {
        // A slow or overloaded provider must not cost the user their
        // briefing — the deterministic version says the same facts.
        body = "";
      }
      if (!body) body = deterministicBriefing(parts, input);
    } else {
      body = deterministicBriefing(parts, input);
    }

    const outcome = await notify({
      userId,
      kind: "briefing_ready",
      title: `הבוקר שלך · ${formatHebrewDate(today, timeZone)}`,
      body,
      reason: briefingReason(parts, calendarConnected),
      action: { type: "open_route", payload: { route: "/" } },
      dedupeKey: buildDedupeKey("briefing_ready", "", today),
      // A morning briefing is worthless by evening; expiring it keeps the
      // notification centre honest instead of accumulating stale mornings.
      expiresAt: endOfLocalDay(now, timeZone),
    });

    return {
      itemsProduced: outcome.created ? 1 : 0,
      detail: {
        aiUsed,
        calendarConnected,
        eventCount: parts.timedEvents.length + parts.allDayEvents.length,
        taskCount: parts.focusTasks.length,
        notified: outcome.created,
        timeZone,
      },
    };
  },
};
