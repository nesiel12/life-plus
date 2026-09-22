import type { LearningBook, LearningBookStatus } from "@/types";

// The reading shelf's own small pieces of arithmetic — kept out of the
// components for the same reason every other derived number in this lab is:
// so "what counts as finished" and "what a stalled book looks like" are
// answered in one tested place, not re-decided per screen.

/** 0..1. A book with no total entered has nothing to divide by — 0, not NaN. */
export function bookProgressFraction(book: Pick<LearningBook, "totalUnits" | "progressUnits">): number {
  if (book.totalUnits <= 0) return 0;
  return Math.min(1, Math.max(0, book.progressUnits / book.totalUnits));
}

const UNIT_LABEL_PLURAL: Record<LearningBook["unitLabel"], string> = { page: "עמודים", chapter: "פרקים" };

/** "120/300 עמודים", or just "45 עמודים" read when there is no total to divide by. */
export function progressLabel(book: Pick<LearningBook, "totalUnits" | "progressUnits" | "unitLabel">): string {
  const unit = UNIT_LABEL_PLURAL[book.unitLabel];
  return book.totalUnits > 0 ? `${book.progressUnits}/${book.totalUnits} ${unit}` : `${book.progressUnits} ${unit}`;
}

/**
 * The status a progress change implies, so ticking a page forward on a book
 * still marked "to_read" moves it to "reading" without a second click, and
 * reaching the total finishes it — matching how the syllabus checklist and
 * the habit tracker elsewhere in this app both auto-derive state from a
 * single real action instead of asking for it twice.
 */
export function statusForProgress(book: Pick<LearningBook, "totalUnits" | "progressUnits" | "status">): LearningBookStatus {
  if (book.totalUnits > 0 && book.progressUnits >= book.totalUnits) return "finished";
  if (book.progressUnits > 0) return "reading";
  return book.status === "finished" ? "reading" : book.status;
}

/**
 * A rough finish estimate from the pace kept since starting, in whole days
 * from `now`. Null when there is nothing to extrapolate from (not started,
 * no total, or already finished) — an estimate with no real pace behind it
 * is a guess dressed as data, which is worse than saying nothing.
 */
export function estimatedDaysToFinish(
  book: Pick<LearningBook, "totalUnits" | "progressUnits" | "startedAt" | "status">,
  now: Date = new Date()
): number | null {
  if (book.status === "finished" || book.totalUnits <= 0 || book.progressUnits <= 0 || !book.startedAt) return null;
  const remaining = book.totalUnits - book.progressUnits;
  if (remaining <= 0) return 0;

  const daysElapsed = Math.max(1, (now.getTime() - new Date(book.startedAt).getTime()) / 86_400_000);
  const perDay = book.progressUnits / daysElapsed;
  if (perDay <= 0) return null;

  return Math.ceil(remaining / perDay);
}

export const BOOK_STATUS_LABELS: Record<LearningBookStatus, string> = {
  to_read: "לקריאה",
  reading: "בקריאה",
  finished: "הושלם",
};
