import { getLocalDayOfWeek } from "@/lib/intelligence/personalDNA/timezone";
import type { PatternCandidate } from "@/lib/intelligence/personalDNA/types";

const DAY_LABELS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]; // index matches Date.getDay()

const MIN_DISTINCT_DAYS_FOR_MOST_ACTIVE_DAY = 7;
const MIN_STRENGTH_FOR_MOST_ACTIVE_DAY = 0.25; // meaningfully more than an even 1/7 ≈ 0.14 baseline
const MIN_WINDOW_DAYS_FOR_CONSISTENCY = 7;
const CONSISTENCY_WINDOW_DAYS = 30;

function toLocalDateKey(isoDateTime: string): string {
  // Distinct-day bucketing needs to agree with getLocalDayOfWeek's timezone,
  // not UTC — otherwise an evening entry near midnight could be counted on
  // the wrong local day.
  const formatted = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date(isoDateTime));
  return formatted; // en-CA formats as YYYY-MM-DD
}

function analyzeMostActiveDay(activityDates: string[]): PatternCandidate | null {
  const distinctDays = new Set(activityDates.map(toLocalDateKey));
  if (distinctDays.size < MIN_DISTINCT_DAYS_FOR_MOST_ACTIVE_DAY) return null;

  const counts = new Array(7).fill(0);
  for (const iso of activityDates) {
    counts[getLocalDayOfWeek(iso)] += 1;
  }

  let topDay = 0;
  let topCount = 0;
  counts.forEach((count, day) => {
    if (count > topCount) {
      topCount = count;
      topDay = day;
    }
  });

  const strength = topCount / activityDates.length;
  if (strength < MIN_STRENGTH_FOR_MOST_ACTIVE_DAY) return null;

  return {
    category: "routine",
    patternType: "mostActiveDay",
    subject: "",
    value: String(topDay),
    description: `יום ${DAY_LABELS[topDay]} הוא היום הכי פעיל שלו באטלס בממוצע.`,
    evidenceCount: activityDates.length,
    strength,
    source: "moments,knowledge_entries",
  };
}

function analyzeActivityConsistency(activityDates: string[], now: number): PatternCandidate | null {
  if (activityDates.length === 0) return null;

  const earliest = Math.min(...activityDates.map((iso) => new Date(iso).getTime()));
  const accountAgeDays = (now - earliest) / 86_400_000;
  const windowDays = Math.min(CONSISTENCY_WINDOW_DAYS, Math.max(1, accountAgeDays));
  if (windowDays < MIN_WINDOW_DAYS_FOR_CONSISTENCY) return null;

  const activeDaysInWindow = new Set(
    activityDates.filter((iso) => (now - new Date(iso).getTime()) / 86_400_000 <= CONSISTENCY_WINDOW_DAYS).map(toLocalDateKey)
  );

  const consistency = Math.min(1, activeDaysInWindow.size / windowDays);
  return {
    category: "routine",
    patternType: "activityConsistency",
    subject: "",
    value: consistency.toFixed(2),
    description: `פעיל באטלס בכ-${Math.round(consistency * 100)}% מהימים ב-30 הימים האחרונים.`,
    evidenceCount: activeDaysInWindow.size,
    strength: Math.min(1, windowDays / CONSISTENCY_WINDOW_DAYS),
    source: "moments,knowledge_entries",
  };
}

// Routine patterns (docs/ATLAS_ARCHITECTURE_VISION.md §3): activity rhythm
// across whatever the user has actually logged (moments + knowledge
// entries) — which day he's most engaged, and how consistently he shows up
// at all. `activityDates` is the caller's merged, pre-fetched set of
// timestamps from both sources (kept generic here so this analyzer doesn't
// need to know about either table's shape).
export function analyzeRoutinePatterns(activityDates: string[], now: number = Date.now()): PatternCandidate[] {
  return [analyzeMostActiveDay(activityDates), analyzeActivityConsistency(activityDates, now)].filter(
    (candidate): candidate is PatternCandidate => candidate !== null
  );
}
