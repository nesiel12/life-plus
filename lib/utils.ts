import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function daysUntil(dateISO: string): number {
  const target = startOfDay(new Date(dateISO));
  const today = startOfDay(new Date());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function daysSince(dateISO: string): number {
  return -daysUntil(dateISO);
}

export function daysUntilNextBirthday(mmdd: string): number | null {
  const [month, day] = mmdd.split("-").map(Number);
  if (!month || !day) return null;

  const today = startOfDay(new Date());
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, month - 1, day);
  }
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
}

const DEFAULT_TREND_WINDOW_DAYS = 14;

export interface ActivityTrend {
  recentCount: number;
  previousCount: number;
}

// Originally built for Areas Experience v2, now reused by Family Experience
// v2 too — there's no score-history (or interaction-history) table for
// either domain, so this windowed-count comparison (last N days vs. the N
// before that) is the honest, real proxy for "is this trending up or down"
// over whatever timestamped rows the caller already has, rather than a
// second implementation per domain.
export function computeActivityTrend(
  activityDates: string[],
  now: number = Date.now(),
  windowDays: number = DEFAULT_TREND_WINDOW_DAYS
): ActivityTrend {
  const windowMs = windowDays * 86_400_000;
  let recentCount = 0;
  let previousCount = 0;

  for (const dateISO of activityDates) {
    const ageMs = now - new Date(dateISO).getTime();
    if (ageMs < 0) continue;
    if (ageMs <= windowMs) recentCount += 1;
    else if (ageMs <= windowMs * 2) previousCount += 1;
  }

  return { recentCount, previousCount };
}
