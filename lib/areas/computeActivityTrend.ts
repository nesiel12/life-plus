const DEFAULT_WINDOW_DAYS = 14;

export interface ActivityTrend {
  recentCount: number;
  previousCount: number;
}

// There's no score-history table (see docs/ATLAS_ARCHITECTURE_VISION.md
// §8) — "recent progress" can't be a true trend line, so this is an honest
// proxy instead: how much logged activity happened in the last window vs.
// the one before it, computed straight from moments'/knowledge_entries'
// existing timestamps rather than inventing a new schema for something a
// simple windowed count already answers.
export function computeActivityTrend(
  activityDates: string[],
  now: number = Date.now(),
  windowDays: number = DEFAULT_WINDOW_DAYS
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
