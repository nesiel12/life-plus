// Date matching for Memory Cards: "this happened a year ago today".
//
// Deliberately independent of where the photo came from. The Google Photos
// Library API no longer permits scanning a user's library by date (the
// photoslibrary.readonly scope was removed 2025-03-31), so the corpus this
// searches is whatever the app has references to — see
// lib/photos/README-constraints.md. The matching logic is the same either way,
// and keeping it pure means it is testable without any Google dependency.

export interface DatedItem {
  /** ISO 8601 instant the photo was taken. */
  creationTime: string;
}

export interface AnniversaryMatch<T extends DatedItem> {
  item: T;
  /** Whole years between the item's date and the reference date. */
  yearsAgo: number;
}

/** Local Y/M/D parts — memories are a wall-clock idea, not a UTC one. */
function parts(date: Date): { y: number; m: number; d: number } {
  return { y: date.getFullYear(), m: date.getMonth(), d: date.getDate() };
}

/**
 * Items taken on the same month+day as `on`, in an earlier year.
 *
 * `toleranceDays` widens the window, because an exact same-day match is rare
 * for a small corpus — with a handful of photos, requiring an exact hit means
 * the feature shows nothing almost every day, which reads as broken rather
 * than as empty.
 */
export function findAnniversaries<T extends DatedItem>(
  items: T[],
  on: Date,
  options: { toleranceDays?: number; maxResults?: number } = {}
): AnniversaryMatch<T>[] {
  const { toleranceDays = 0, maxResults = 5 } = options;
  const today = parts(on);

  const matches: (AnniversaryMatch<T> & { distance: number })[] = [];

  for (const item of items) {
    const taken = new Date(item.creationTime);
    if (Number.isNaN(taken.getTime())) continue;

    const t = parts(taken);
    const yearsAgo = today.y - t.y;
    if (yearsAgo < 1) continue;

    // Compare within the *item's* year so leap days and month lengths behave.
    // Distance is measured against the same calendar day shifted back by
    // yearsAgo, which is what "a year ago today" means to a person.
    const shifted = new Date(taken.getFullYear(), today.m, today.d);
    const distance = Math.round(
      Math.abs(shifted.getTime() - new Date(t.y, t.m, t.d).getTime()) / 86_400_000
    );

    if (distance <= toleranceDays) {
      matches.push({ item, yearsAgo, distance });
    }
  }

  return matches
    .sort((a, b) => a.distance - b.distance || a.yearsAgo - b.yearsAgo)
    .slice(0, maxResults)
    .map(({ item, yearsAgo }) => ({ item, yearsAgo }));
}

/** Hebrew phrasing for the card's kicker. */
export function yearsAgoLabel(yearsAgo: number): string {
  if (yearsAgo === 1) return "לפני שנה";
  if (yearsAgo === 2) return "לפני שנתיים";
  return `לפני ${yearsAgo} שנים`;
}
