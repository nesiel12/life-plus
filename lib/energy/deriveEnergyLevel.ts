// Today's energy-level card (docs/ATLAS_ARCHITECTURE_VISION.md §12):
// "energy" is never invented — it's the same real, confidence-gated
// peakActivityWindow pattern the Personal DNA Engine (§3) already computes
// from when the user actually logs moments per life area, compared against
// the current real local hour. No new signal, no new analyzer.
import { hourToWindow, type TimeWindow } from "@/lib/intelligence/personalDNA/analyzers/focus";
import { momentCategoryLabel } from "@/lib/lifeAreas";
import type { MomentCategory } from "@/types";

export type EnergyLevel = "peak" | "typical" | "unknown";

export interface PeakActivityPattern {
  area: MomentCategory;
  window: TimeWindow;
  confidence: number;
}

export interface EnergyReading {
  level: EnergyLevel;
  matchingAreas: MomentCategory[];
  rationale: string;
}

const NO_EVIDENCE_RATIONALE = "עדיין אין מספיק נתונים כדי לדעת מתי אתה הכי פעיל.";

// Absence of a matching pattern is NOT evidence of low energy — it only
// means this hour isn't a *known* peak window for any life area yet, which
// is why this never returns anything resembling "low" (that would be a
// negative claim this app has no real signal to back).
export function deriveEnergyLevel(patterns: PeakActivityPattern[], currentHour: number): EnergyReading {
  if (patterns.length === 0) {
    return { level: "unknown", matchingAreas: [], rationale: NO_EVIDENCE_RATIONALE };
  }

  const currentWindow = hourToWindow(currentHour);
  const matchingAreas = patterns.filter((p) => p.window === currentWindow).map((p) => p.area);

  if (matchingAreas.length === 0) {
    return {
      level: "typical",
      matchingAreas: [],
      rationale: "השעה הזו לא מזוהה כזמן השיא המוכר שלך באף תחום — זה בסדר גמור, סתם לא הזמן הכי נלהב שלך בדרך כלל.",
    };
  }

  const areaLabels = matchingAreas.map(momentCategoryLabel).join(", ");
  return {
    level: "peak",
    matchingAreas,
    rationale: `זה בדרך כלל אחד הזמנים הכי פעילים שלך ב${matchingAreas.length > 1 ? "תחומים" : "תחום"}: ${areaLabels}.`,
  };
}
