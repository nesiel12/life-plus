// Nutrition arithmetic for the Health dashboard — targets, totals, presets.
//
// Pure and client-safe. The rings, the quick-log presets and the AI estimate's
// sanity check all read from here, so "how much protein today" is answered by
// one function whether it is drawn on a ring or sent to the coach.
//
// Honesty rule: a meal with no macros is UNKNOWN, not zero. Totals only add
// what is known and report how many meals were left out, so a day with three
// unestimated meals is never drawn as a day of starving.

import type { MealType } from "@/types";

export interface HealthTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
}

/**
 * Defaults for an adult with no targets set: a moderate maintenance day.
 * Deliberately round and generic — the UI invites the user to set their own
 * rather than implying these were computed for them.
 */
export const DEFAULT_TARGETS: HealthTargets = {
  calories: 2200,
  proteinG: 130,
  carbsG: 250,
  fatG: 70,
  waterMl: 2500,
};

const TARGET_BOUNDS: Record<keyof HealthTargets, [number, number]> = {
  calories: [800, 6000],
  proteinG: [20, 400],
  carbsG: [20, 800],
  fatG: [10, 300],
  waterMl: [500, 6000],
};

/** Reads stored targets defensively: unknown keys ignored, out-of-range values clamped. */
export function readTargets(value: unknown): HealthTargets {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TARGETS };
  for (const key of Object.keys(TARGET_BOUNDS) as (keyof HealthTargets)[]) {
    const raw = Number(source[key]);
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const [min, max] = TARGET_BOUNDS[key];
    out[key] = Math.round(Math.min(max, Math.max(min, raw)));
  }
  return out;
}

export interface MacroMeal {
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Meals that contributed numbers. */
  known: number;
  /** Meals logged without an estimate — excluded, and said so. */
  unknown: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function sumMacros(meals: readonly MacroMeal[]): MacroTotals {
  const totals: MacroTotals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, known: 0, unknown: 0 };
  for (const meal of meals) {
    const hasAny = [meal.calories, meal.proteinG, meal.carbsG, meal.fatG].some((v) => typeof v === "number");
    if (!hasAny) {
      totals.unknown++;
      continue;
    }
    totals.known++;
    totals.calories += meal.calories ?? caloriesFromMacros(meal.proteinG ?? 0, meal.carbsG ?? 0, meal.fatG ?? 0);
    totals.proteinG += meal.proteinG ?? 0;
    totals.carbsG += meal.carbsG ?? 0;
    totals.fatG += meal.fatG ?? 0;
  }
  return {
    ...totals,
    calories: Math.round(totals.calories),
    proteinG: round1(totals.proteinG),
    carbsG: round1(totals.carbsG),
    fatG: round1(totals.fatG),
  };
}

/** Atwater factors: 4 kcal/g protein and carbohydrate, 9 kcal/g fat. */
export function caloriesFromMacros(proteinG: number, carbsG: number, fatG: number): number {
  return Math.round(proteinG * 4 + carbsG * 4 + fatG * 9);
}

export interface RingValue {
  /** 0..1 for drawing the ring. */
  fraction: number;
  /** Past the target — drawn differently, never as a bigger "win". */
  over: boolean;
  remaining: number;
}

export function ringProgress(value: number, target: number): RingValue {
  if (target <= 0) return { fraction: 0, over: false, remaining: 0 };
  return {
    fraction: Math.min(1, Math.max(0, value / target)),
    over: value > target * 1.05,
    remaining: Math.max(0, Math.round(target - value)),
  };
}

export interface MacroEstimate {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * Makes a model's estimate internally consistent before it is stored.
 *
 * Models round and guess; the one thing that must hold is that calories agree
 * with the macros (Atwater). When they disagree by more than 20%, the macros
 * win — they are what the model itemised — and calories are recomputed.
 * Values are clamped to a plausible single-meal range.
 */
export function sanitizeEstimate(estimate: Partial<MacroEstimate>): MacroEstimate {
  const clamp = (n: unknown, max: number) => {
    const value = Number(n);
    return Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : 0;
  };
  const proteinG = round1(clamp(estimate.proteinG, 250));
  const carbsG = round1(clamp(estimate.carbsG, 500));
  const fatG = round1(clamp(estimate.fatG, 250));
  const fromMacros = caloriesFromMacros(proteinG, carbsG, fatG);
  const stated = clamp(estimate.calories, 5000);
  const agrees = fromMacros === 0 ? stated > 0 : Math.abs(stated - fromMacros) / fromMacros <= 0.2;
  return { proteinG, carbsG, fatG, calories: Math.round(agrees && stated > 0 ? stated : fromMacros) };
}

/** The meal slot for a time of day — the default when logging "now". */
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 18 && hour < 22) return "dinner";
  return "snack";
}

export interface MealPreset extends MacroEstimate {
  id: string;
  label: string;
  emoji: string;
  /** Where it usually belongs; the quick log still uses the hour when absent. */
  type?: MealType;
}

/**
 * One-tap meals, with typical home-portion macros. Local, everyday dishes —
 * the whole point of a preset is that it matches what is actually on the
 * plate most days, so it can be logged without typing.
 */
export const MEAL_PRESETS: MealPreset[] = [
  { id: "shakshuka", label: "שקשוקה עם לחם", emoji: "🍳", type: "breakfast", calories: 520, proteinG: 24, carbsG: 48, fatG: 26 },
  { id: "yogurt", label: "יוגורט עם גרנולה", emoji: "🥣", type: "breakfast", calories: 330, proteinG: 17, carbsG: 45, fatG: 9 },
  { id: "omelet", label: "חביתה וסלט", emoji: "🥗", type: "breakfast", calories: 380, proteinG: 20, carbsG: 14, fatG: 27 },
  { id: "toast", label: "טוסט גבינה", emoji: "🥪", calories: 420, proteinG: 21, carbsG: 40, fatG: 19 },
  { id: "chicken-rice", label: "חזה עוף ואורז", emoji: "🍗", type: "lunch", calories: 610, proteinG: 48, carbsG: 70, fatG: 12 },
  { id: "hummus-pita", label: "פיתה עם חומוס", emoji: "🫓", type: "lunch", calories: 560, proteinG: 18, carbsG: 76, fatG: 20 },
  { id: "schnitzel", label: "שניצל ופירה", emoji: "🍽️", type: "lunch", calories: 780, proteinG: 38, carbsG: 62, fatG: 40 },
  { id: "salmon", label: "סלמון וירקות", emoji: "🐟", type: "dinner", calories: 520, proteinG: 38, carbsG: 16, fatG: 32 },
  { id: "pasta", label: "פסטה ברוטב עגבניות", emoji: "🍝", type: "dinner", calories: 590, proteinG: 18, carbsG: 98, fatG: 12 },
  { id: "protein-shake", label: "שייק חלבון", emoji: "🥤", type: "post-workout", calories: 220, proteinG: 30, carbsG: 12, fatG: 4 },
  { id: "fruit", label: "פרי", emoji: "🍎", type: "snack", calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3 },
  { id: "nuts", label: "חופן אגוזים", emoji: "🥜", type: "snack", calories: 180, proteinG: 6, carbsG: 6, fatG: 16 },
];

/**
 * One line of advice from where the day actually stands — deterministic, so it
 * renders with the page and costs nothing. The AI coach below it is the
 * deeper, on-request layer.
 *
 * Paced to the waking day: 40g of protein is behind at 20:00 and fine at 10:00.
 */
export function nutritionPaceTip(totals: MacroTotals, targets: HealthTargets, now: Date): string {
  const hour = now.getHours() + now.getMinutes() / 60;
  // Fraction of the eating day (07:00–21:00) that has passed.
  const dayShare = Math.min(1, Math.max(0, (hour - 7) / 14));

  if (totals.known === 0 && totals.unknown === 0) {
    return hour < 11 ? "עוד לא נרשמה ארוחה היום. ארוחת בוקר עם חלבון תייצב את האנרגיה עד הצהריים." : "עוד לא נרשמה ארוחה היום — כדאי לרשום את מה שאכלת כדי לראות את התמונה.";
  }
  if (totals.known === 0) {
    return "הארוחות של היום נרשמו בלי הערכת ערכים. אפשר להוסיף הערכה כדי לראות את הטבעות מתמלאות.";
  }
  if (totals.calories > targets.calories * 1.1) {
    return "עברת את יעד הקלוריות להיום. ארוחה קלה ועשירה בירקות תאזן את הערב.";
  }
  const proteinPace = totals.proteinG / Math.max(1, targets.proteinG * Math.max(0.25, dayShare));
  if (proteinPace < 0.7) {
    const missing = Math.round(targets.proteinG - totals.proteinG);
    return `החלבון מפגר אחרי הקצב — חסרים עוד כ-${missing} גרם. ביצים, יוגורט, עוף או קטניות יסגרו את הפער.`;
  }
  if (totals.fatG > targets.fatG * Math.max(0.5, dayShare) * 1.3) {
    return "השומן גבוה יחסית לשעה. לארוחה הבאה כדאי לבחור מקור חלבון רזה.";
  }
  if (dayShare > 0.8 && totals.calories < targets.calories * 0.6) {
    return "נשארו לא מעט קלוריות ליעד היומי. ארוחת ערב מלאה תעזור להתאושש ולישון טוב.";
  }
  return "הקצב של היום מאוזן — ממשיכים כך.";
}
