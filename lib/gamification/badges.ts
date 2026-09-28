// Unlockable badges — a static, code-owned catalog (same "the catalog is
// code, not data" rule the XP Shop's item_id follows) plus deterministic
// rule checks over aggregated stats. Nothing here is AI-judged: every badge
// is a plain threshold on a number lib/gamification/statsService.ts already
// computed from real rows.

export type BadgeIcon =
  | "Sunrise"
  | "Flame"
  | "CalendarCheck"
  | "Crown"
  | "Trophy"
  | "Swords"
  | "Sparkles"
  | "Rocket";

export interface BadgeContext {
  currentStreak: number;
  longestStreak: number;
  totalTasksCompleted: number;
  totalHabitCheckIns: number;
  /** Distinct days with any completion at all, not necessarily consecutive. */
  totalActiveDays: number;
  /** Completions (tasks + habit check-ins) logged before 8:00 local time. */
  earlyCompletions: number;
}

export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
  icon: BadgeIcon;
  isEarned: (ctx: BadgeContext) => boolean;
  /** 0..1, for a progress bar on a badge not yet earned. */
  progress: (ctx: BadgeContext) => number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Ordered roughly easiest-to-hardest, so a fresh account's badge shelf
 *  reads as a visible ladder rather than a random scatter. */
export const BADGE_CATALOG: readonly BadgeDefinition[] = [
  {
    id: "early_bird",
    title: "ציפור מוקדמת",
    description: "השלימו 5 משימות או הרגלים לפני השעה 8:00 בבוקר",
    icon: "Sunrise",
    isEarned: (ctx) => ctx.earlyCompletions >= 5,
    progress: (ctx) => clamp01(ctx.earlyCompletions / 5),
  },
  {
    id: "streak_starter",
    title: "התחלה מבטיחה",
    description: "שמרו על רצף של 3 ימים רצופים",
    icon: "Flame",
    isEarned: (ctx) => ctx.longestStreak >= 3,
    progress: (ctx) => clamp01(ctx.longestStreak / 3),
  },
  {
    id: "week_warrior",
    title: "לוחם השבוע",
    description: "שמרו על רצף של 7 ימים רצופים",
    icon: "CalendarCheck",
    isEarned: (ctx) => ctx.longestStreak >= 7,
    progress: (ctx) => clamp01(ctx.longestStreak / 7),
  },
  {
    id: "habit_hero",
    title: "גיבור ההרגלים",
    description: "בצעו 50 צ'ק-אין להרגלים",
    icon: "Sparkles",
    isEarned: (ctx) => ctx.totalHabitCheckIns >= 50,
    progress: (ctx) => clamp01(ctx.totalHabitCheckIns / 50),
  },
  {
    id: "momentum_master",
    title: "אלוף המומנטום",
    description: "היו פעילים ב-30 ימים שונים",
    icon: "Rocket",
    isEarned: (ctx) => ctx.totalActiveDays >= 30,
    progress: (ctx) => clamp01(ctx.totalActiveDays / 30),
  },
  {
    id: "consistency_king",
    title: "מלך העקביות",
    description: "שמרו על רצף של 30 ימים רצופים",
    icon: "Crown",
    isEarned: (ctx) => ctx.longestStreak >= 30,
    progress: (ctx) => clamp01(ctx.longestStreak / 30),
  },
  {
    id: "task_crusher",
    title: "מרסק המשימות",
    description: "השלימו 100 משימות",
    icon: "Swords",
    isEarned: (ctx) => ctx.totalTasksCompleted >= 100,
    progress: (ctx) => clamp01(ctx.totalTasksCompleted / 100),
  },
  {
    id: "century_club",
    title: "מועדון המאה",
    description: "שמרו על רצף של 100 ימים רצופים",
    icon: "Trophy",
    isEarned: (ctx) => ctx.longestStreak >= 100,
    progress: (ctx) => clamp01(ctx.longestStreak / 100),
  },
];

/** Every badge id the context currently satisfies — recomputed fresh each
 *  time, never read from the earned-badges ledger, so a catalog change can
 *  never leave a stale id "earned" forever. */
export function evaluateBadges(ctx: BadgeContext): string[] {
  return BADGE_CATALOG.filter((badge) => badge.isEarned(ctx)).map((badge) => badge.id);
}

/** Which of the currently-satisfied badges are not yet in the ledger — the
 *  ones worth claiming and celebrating this time. */
export function newlyEarnedBadgeIds(ctx: BadgeContext, alreadyEarnedIds: readonly string[]): string[] {
  const already = new Set(alreadyEarnedIds);
  return evaluateBadges(ctx).filter((id) => !already.has(id));
}
