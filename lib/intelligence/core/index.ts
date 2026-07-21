// The Atlas Intelligence Engine's public surface (docs/ATLAS_ARCHITECTURE_
// VISION.md §9). Entirely pure — it operates on AtlasContext, which the
// Context Engine has already fetched, so no server-only module lives here
// and every piece stays unit-testable without mocking the database.
export {
  buildIntelligenceSignals,
  filterSignalsByCategory,
  CATEGORY_DEFAULTS,
  WEAK_LIFE_AREA_SCORE_THRESHOLD,
  WEAK_LIFE_AREA_IMPORTANCE,
} from "@/lib/intelligence/core/normalize";
export { rankSignals } from "@/lib/intelligence/core/rank";
export { detectPriorityConflicts } from "@/lib/intelligence/core/conflicts";
export { formatSignalsForPrompt } from "@/lib/intelligence/core/format";
export type { IntelligenceSignal, RankedSignal, SignalCategory, PriorityConflict } from "@/lib/intelligence/core/types";
