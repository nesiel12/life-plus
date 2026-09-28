import "server-only";
import { tasksRepo } from "@/lib/db/tasks";
import { habitsRepo, habitLogsRepo } from "@/lib/db/habits";
import { taskCompletionsRepo } from "@/lib/db/taskCompletions";
import { momentumBadgesRepo } from "@/lib/db/momentumBadges";
import { momentumStreakFreezesRepo } from "@/lib/db/momentumStreakFreezes";
import { cached, invalidate } from "@/lib/api/ttlCache";
import { getLocalDateKey, getLocalHour } from "@/lib/intelligence/personalDNA/timezone";
import { activeDatesFrom, countCompletionsByDay, peakCount } from "@/lib/gamification/dailyActivity";
import {
  availableStreakFreezes,
  computeMomentumStreak,
  decideStreakFreezeConsumption,
  lifetimeStreakFreezesEarned,
} from "@/lib/gamification/streaks";
import { computeDailyMomentum, momentumTier } from "@/lib/gamification/momentum";
import { BADGE_CATALOG, newlyEarnedBadgeIds, type BadgeContext } from "@/lib/gamification/badges";
import type { MomentumDashboardData } from "@/types/gamification";

// The Statistics & Analytics Center's one entry point. Every widget's data
// comes from here, computed from tasks/habits/habit_logs plus the three
// ledgers this feature adds (task_completions, momentum_badges,
// momentum_streak_freezes) — all pure arithmetic (lib/gamification/*), no
// model call anywhere in the chain.
//
// Short-TTL cache rather than a materialized view: this is a single-user
// app (see lib/intelligence/personalDNA/timezone.ts's own note on that), so
// the real cost isn't query volume, it's recomputing four aggregations from
// scratch on every render of a dashboard someone is actively looking at.
const CACHE_TTL_MS = 30_000;

function cacheKey(userId: string): string {
  return `momentum-dashboard:${userId}`;
}

export async function getMomentumDashboard(userId: string): Promise<MomentumDashboardData> {
  return cached(cacheKey(userId), CACHE_TTL_MS, () => buildMomentumDashboard(userId));
}

/** Call after any write that can change today's numbers (a task or habit
 *  toggle) so the next read isn't stuck serving a stale cache for the rest
 *  of the TTL — same pattern lib/api/insightsCache.ts already uses. */
export function invalidateMomentumDashboard(userId: string): void {
  invalidate(cacheKey(userId));
}

async function buildMomentumDashboard(userId: string): Promise<MomentumDashboardData> {
  const [tasks, habits, taskCompletions, habitLogs, earnedBadges, freezeConsumptions] = await Promise.all([
    tasksRepo.list(userId),
    habitsRepo.list(userId),
    taskCompletionsRepo.list(userId),
    habitLogsRepo.list(userId),
    momentumBadgesRepo.list(userId),
    momentumStreakFreezesRepo.list(userId),
  ]);

  const now = Date.now();
  const todayKey = getLocalDateKey(new Date(now).toISOString());

  const datedTaskCompletions = taskCompletions.map((c) => ({ completedDate: c.completed_date }));
  const datedHabitLogs = habitLogs.map((l) => ({ completedDate: l.completed_date }));

  // --- Heatmap ---------------------------------------------------------
  const counts = countCompletionsByDay(datedTaskCompletions, datedHabitLogs);
  const peak = peakCount(counts);

  // --- Streak + Streak Freezes ------------------------------------------
  const realActiveDates = activeDatesFrom(datedTaskCompletions, datedHabitLogs);
  let consumedDates = freezeConsumptions.map((f) => f.covers_date);

  const freezesBeforeConsumption = availableStreakFreezes(realActiveDates, consumedDates.length);
  const dateToConsume = decideStreakFreezeConsumption({
    realActiveDates,
    consumedDates,
    availableFreezes: freezesBeforeConsumption,
    now,
  });
  if (dateToConsume) {
    await momentumStreakFreezesRepo.consume(userId, dateToConsume);
    consumedDates = [...consumedDates, dateToConsume];
  }

  const streakState = computeMomentumStreak([...realActiveDates, ...consumedDates], now);
  const freezesEarned = lifetimeStreakFreezesEarned(realActiveDates);
  const freezesAvailable = availableStreakFreezes(realActiveDates, consumedDates.length);

  // --- Daily Momentum Score ----------------------------------------------
  // "Today's" tasks are the ones due today, plus any completed today
  // regardless of due date — finishing an overdue or someday item still
  // counts as today's execution. Habits are daily by design (habits.sql's
  // own header), so every habit is always "today's".
  const completedDateByTaskId = new Map(taskCompletions.map((c) => [c.task_id, c.completed_date]));
  const todaysTasks = tasks
    .filter((t) => {
      const dueKey = t.due_date ? getLocalDateKey(t.due_date) : null;
      return dueKey === todayKey || completedDateByTaskId.get(t.id) === todayKey;
    })
    .map((t) => ({ priority: t.priority, isCompleted: t.status === "done" }));

  const habitsCompletedToday = new Set(habitLogs.filter((l) => l.completed_date === todayKey).map((l) => l.habit_id));
  const todaysHabits = habits.map((h) => ({ isCompleted: habitsCompletedToday.has(h.id) }));

  const momentumResult = computeDailyMomentum(todaysTasks, todaysHabits);

  // --- Badges --------------------------------------------------------------
  // created_at's local hour is a proxy for "when this was checked off" —
  // completed_date itself is a plain date, no time of day.
  const earlyCompletions =
    taskCompletions.filter((c) => getLocalHour(c.created_at) < 8).length +
    habitLogs.filter((l) => getLocalHour(l.created_at) < 8).length;

  const ctx: BadgeContext = {
    currentStreak: streakState.currentStreak,
    longestStreak: streakState.longestStreak,
    totalTasksCompleted: taskCompletions.length,
    totalHabitCheckIns: habitLogs.length,
    totalActiveDays: realActiveDates.length,
    earlyCompletions,
  };

  const alreadyEarnedIds = earnedBadges.map((b) => b.badge_id);
  const newIds = newlyEarnedBadgeIds(ctx, alreadyEarnedIds);
  if (newIds.length > 0) {
    await momentumBadgesRepo.claimMany(userId, newIds);
  }

  const earnedAtById = new Map(earnedBadges.map((b) => [b.badge_id, b.earned_at]));
  const newIdSet = new Set(newIds);
  const nowIso = new Date(now).toISOString();

  // Once a badge is in the ledger it stays "earned" forever, even if the
  // live stat that unlocked it later dips (e.g. a completed task gets
  // un-checked) — an achievement, not a live gauge. See momentum_badges'
  // migration header.
  const badges = BADGE_CATALOG.map((badge) => {
    const earned = earnedAtById.has(badge.id) || newIdSet.has(badge.id);
    return {
      id: badge.id,
      title: badge.title,
      description: badge.description,
      icon: badge.icon,
      earned,
      earnedAt: earnedAtById.get(badge.id) ?? (newIdSet.has(badge.id) ? nowIso : null),
      progress: earned ? 1 : badge.progress(ctx),
      isNew: newIdSet.has(badge.id),
    };
  });

  return {
    heatmap: { counts, peak },
    streak: {
      currentStreak: streakState.currentStreak,
      longestStreak: streakState.longestStreak,
      activeDays: streakState.activeDays,
      freezesEarned,
      freezesAvailable,
    },
    momentum: { ...momentumResult, tier: momentumTier(momentumResult.score) },
    badges,
  };
}
