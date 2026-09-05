import { dayPartForHour } from "@/lib/onboarding/chronotype";
import type { DayPart, Meal, Workout } from "@/types";

// The Wellness Copilot's suggestion logic.
//
// Deterministic and pure, for the same reason the Decision Stream is: these
// are prompts a person is meant to act on, they render with the page, and a
// model call would make them arrive late and cost money on every visit. The
// interesting part is not generating text — it is deciding *what is actually
// true right now* about the user's day, which is arithmetic over their own
// logged meals, workouts and clock.
//
// Every suggestion is grounded in something real: an actual gap since the
// last logged workout, an actual missing meal, the actual hour. Nothing here
// invents a statistic or claims a health outcome.

export type WellnessKind = "workout" | "nutrition" | "hydration" | "mindset";

export interface WellnessSuggestion {
  id: string;
  kind: WellnessKind;
  title: string;
  detail: string;
  /** Higher shows first. */
  score: number;
  /** Present when the suggestion is a schedulable block. */
  scheduleMinutes?: number;
}

const TIER = {
  workout: 400,
  nutrition: 300,
  hydration: 200,
  mindset: 100,
} as const;

export interface WellnessInput {
  meals: Meal[];
  workouts: Workout[];
  now: Date;
  /** Minutes of free time starting now, when the calendar is known. */
  freeMinutesNow?: number;
}

function sameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  );
}

function hoursSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return (now.getTime() - then) / 3_600_000;
}

/** The most recent workout by start time, or null. */
export function lastWorkout(workouts: Workout[]): Workout | null {
  if (workouts.length === 0) return null;
  return workouts.reduce((latest, w) =>
    new Date(w.startTime).getTime() > new Date(latest.startTime).getTime() ? w : latest
  );
}

// Time-of-day guidance. Written per day-part rather than per hour so the
// message changes a handful of times a day, not constantly — a tip that
// rewrites itself every hour reads as noise rather than advice.
const MINDSET: Partial<Record<DayPart, { title: string; detail: string }>> = {
  earlyMorning: {
    title: "פתיחת יום",
    detail: "כמה דקות של תנועה עכשיו מקלות על שאר היום. אפילו מתיחות קצרות נחשבות.",
  },
  morning: {
    title: "חלון האנרגיה",
    detail: "זו בדרך כלל השעה שבה הגוף הכי ער — שווה לנצל אותה למשהו תובעני.",
  },
  afternoon: {
    title: "הפסקת ריכוז",
    detail: "צניחת הריכוז אחרי הצהריים היא נורמלית. קום, זוז כמה דקות, וחזור.",
  },
  evening: {
    title: "האטה",
    detail: "אימון קל בערב בסדר גמור, אבל כדאי להימנע ממאמץ קשה קרוב לשינה.",
  },
  night: {
    title: "סגירת יום",
    detail: "מסך פחות ואור עמום בשעה הקרובה יעזרו לשינה. זה הזמן להוריד הילוך.",
  },
};

/**
 * Builds today's wellness suggestions, ranked.
 *
 * Returns an empty list rather than filler when there is genuinely nothing
 * worth saying — the same quiet-empty-state convention every other surface
 * in this app follows.
 */
export function buildWellnessSuggestions({
  meals,
  workouts,
  now,
  freeMinutesNow,
}: WellnessInput): WellnessSuggestion[] {
  const out: WellnessSuggestion[] = [];
  const hour = now.getHours();
  const part = dayPartForHour(hour);

  // ── Workout ──
  const last = lastWorkout(workouts);
  const sinceWorkout = hoursSince(last?.startTime, now);
  const workedOutToday = workouts.some((w) => sameDay(w.startTime, now));

  if (!workedOutToday) {
    // Only offer "right now" when there is genuinely time for it. Suggesting
    // a 30-minute session into a 10-minute gap is worse than saying nothing,
    // because it teaches the user the suggestions aren't real.
    const canNow = freeMinutesNow === undefined || freeMinutesNow >= 30;
    out.push({
      id: "workout-today",
      kind: "workout",
      title: canNow ? "אימון עכשיו" : "אימון בהמשך",
      detail:
        sinceWorkout === null
          ? "עדיין לא רשמת אימון. אפילו 20 דקות של הליכה נחשבות."
          : sinceWorkout >= 48
            ? `עברו ${Math.floor(sinceWorkout / 24)} ימים מהאימון האחרון.`
            : "לא רשמת אימון היום.",
      score: TIER.workout + (sinceWorkout && sinceWorkout >= 48 ? 50 : 0),
      scheduleMinutes: canNow ? 30 : 60,
    });
  }

  // ── Nutrition ──
  const todayMeals = meals.filter((m) => sameDay(m.eatenAt, now));
  const hasBreakfast = todayMeals.some((m) => m.type === "breakfast");
  const hasLunch = todayMeals.some((m) => m.type === "lunch");

  if (hour >= 9 && hour < 12 && !hasBreakfast) {
    out.push({
      id: "nutrition-breakfast",
      kind: "nutrition",
      title: "לא רשמת ארוחת בוקר",
      detail: "משהו עם חלבון ופחמימה מלאה יחזיק אותך עד הצהריים.",
      score: TIER.nutrition + 20,
    });
  } else if (hour >= 13 && hour < 16 && !hasLunch) {
    out.push({
      id: "nutrition-lunch",
      kind: "nutrition",
      title: "לא רשמת ארוחת צהריים",
      detail: "ארוחה מאוזנת עכשיו תמנע את הנפילה של אחר הצהריים.",
      score: TIER.nutrition + 10,
    });
  } else if (todayMeals.length > 0 && hour >= 16 && hour < 20) {
    out.push({
      id: "nutrition-snack",
      kind: "nutrition",
      title: "חטיף נקי",
      detail: "אגוזים, פרי או יוגורט — משהו שלא יפיל את האנרגיה בעוד שעה.",
      score: TIER.nutrition,
    });
  }

  // ── Hydration ──
  // Deliberately not a fabricated "you have drunk 3 of 8 glasses": the app
  // does not track water, and inventing a count would be a made-up number
  // presented as fact. A time-based nudge is honest about what it knows.
  if (hour >= 8 && hour < 22) {
    out.push({
      id: "hydration",
      kind: "hydration",
      title: "כוס מים",
      detail: "תזכורת קלה — רוב הצמא במהלך היום מתפרש בטעות כעייפות.",
      score: TIER.hydration,
    });
  }

  // ── Mindset ──
  const mindset = part ? MINDSET[part] : undefined;
  if (mindset) {
    out.push({
      id: `mindset-${part}`,
      kind: "mindset",
      title: mindset.title,
      detail: mindset.detail,
      score: TIER.mindset,
    });
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
