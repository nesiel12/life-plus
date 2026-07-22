import { getLocalHour } from "@/lib/intelligence/personalDNA/timezone";
import type { PatternCandidate } from "@/lib/intelligence/personalDNA/types";
import type { MomentCategory } from "@/types";

export type TimeWindow = "morning" | "midday" | "afternoon" | "evening" | "night";

// Exported for lib/energy/deriveEnergyLevel.ts (Today's energy-level card,
// docs/ATLAS_ARCHITECTURE_VISION.md §12): comparing "the user's current
// local hour" against a peakActivityWindow pattern's value only means
// something if both sides bucket hours into windows the exact same way.
export const WINDOW_LABELS: Record<TimeWindow, string> = {
  morning: "05:00–11:00",
  midday: "11:00–15:00",
  afternoon: "15:00–18:00",
  evening: "18:00–22:00",
  night: "22:00–05:00",
};

const CATEGORY_LABELS: Record<MomentCategory, string> = {
  faith: "אמונה",
  family: "משפחה",
  knowledge: "ידע",
  health: "בריאות",
  career: "קריירה",
  general: "כללי",
};

const MIN_EVIDENCE_PER_CATEGORY = 5;

export function hourToWindow(hour: number): TimeWindow {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 15) return "midday";
  if (hour >= 15 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

export interface FocusMomentInput {
  category: MomentCategory;
  occurredAt: string; // ISO datetime
}

// Focus patterns (docs/ATLAS_ARCHITECTURE_VISION.md §3): when, by life
// area, the user actually logs moments — the closest real signal to "when
// is he engaged with this part of his life" without inventing anything
// beyond what he already recorded.
export function analyzeFocusPatterns(moments: FocusMomentInput[]): PatternCandidate[] {
  const byCategory = new Map<MomentCategory, FocusMomentInput[]>();
  for (const moment of moments) {
    const list = byCategory.get(moment.category) ?? [];
    list.push(moment);
    byCategory.set(moment.category, list);
  }

  const candidates: PatternCandidate[] = [];

  for (const [category, items] of byCategory) {
    if (items.length < MIN_EVIDENCE_PER_CATEGORY) continue;

    const windowCounts = new Map<TimeWindow, number>();
    for (const item of items) {
      const window = hourToWindow(getLocalHour(item.occurredAt));
      windowCounts.set(window, (windowCounts.get(window) ?? 0) + 1);
    }

    let topWindow: TimeWindow | null = null;
    let topCount = 0;
    for (const [window, count] of windowCounts) {
      if (count > topCount) {
        topWindow = window;
        topCount = count;
      }
    }
    if (!topWindow) continue;

    candidates.push({
      category: "focus",
      patternType: "peakActivityWindow",
      subject: category,
      value: topWindow,
      description: `הרגעים בתחום ${CATEGORY_LABELS[category]} מתועדים בעיקר בין ${WINDOW_LABELS[topWindow]}.`,
      evidenceCount: items.length,
      strength: topCount / items.length,
      source: "moments",
    });
  }

  return candidates;
}
