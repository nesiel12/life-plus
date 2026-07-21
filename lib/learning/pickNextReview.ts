export interface ReviewCandidate {
  id: string;
  date: string; // the entry's own date — the reference point until ever reviewed
  lastReviewedAt?: string;
}

// The entry touched least recently — a real, deterministic, explainable
// signal ("you haven't reviewed this in the longest time"), never an
// invented spaced-repetition curve. Falls back to the entry's own date when
// it has no lastReviewedAt yet (never reviewed since it was logged).
export function pickNextReview<T extends ReviewCandidate>(entries: T[]): T | null {
  if (entries.length === 0) return null;

  return entries.reduce((oldest, entry) => {
    const entryTime = new Date(entry.lastReviewedAt ?? entry.date).getTime();
    const oldestTime = new Date(oldest.lastReviewedAt ?? oldest.date).getTime();
    return entryTime < oldestTime ? entry : oldest;
  });
}
