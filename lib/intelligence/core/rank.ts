import type { IntelligenceSignal, RankedSignal, SignalCategory } from "@/lib/intelligence/core/types";

// Deterministic scoring — no ML, every weight named and justified.
// Importance carries the most weight because it's the category-level
// judgment of "does this generally matter." Confidence next, so a
// low-certainty inferred pattern can't outrank a well-evidenced one purely
// by being tagged important. Recency last and smallest: v1 doesn't yet
// recover real per-item recency (every signal is flat at 1, see
// buildIntelligenceSignals) so this term is currently a constant — kept in
// the formula, not hardcoded away, so a future signal source that *does*
// carry real recency slots in without changing the scoring contract.
const IMPORTANCE_WEIGHT = 0.5;
const CONFIDENCE_WEIGHT = 0.3;
const RECENCY_WEIGHT = 0.2;

// Deterministic tie-break when two signals score identically — time-bound
// commitments first (an upcoming event is concrete and dated), then active
// commitments (goals), then relationship care, then what Atlas knows about
// the person (stated, then inferred), then retrieved history, then ambient
// state, then aggregate feedback stats. Documented so "why did X rank above
// Y at equal score" always has a stated answer, never an implicit one.
const CATEGORY_PRIORITY: SignalCategory[] = [
  "upcomingEvent",
  "goal",
  "relationship",
  "personalDNA",
  "personalPattern",
  "memory",
  "lifeArea",
  "recommendation",
];

function categoryPriorityIndex(category: SignalCategory): number {
  const index = CATEGORY_PRIORITY.indexOf(category);
  return index === -1 ? CATEGORY_PRIORITY.length : index;
}

function computeScore(signal: IntelligenceSignal): number {
  return (
    IMPORTANCE_WEIGHT * signal.importance + CONFIDENCE_WEIGHT * signal.confidence + RECENCY_WEIGHT * signal.recency
  );
}

// Explainability (docs/ATLAS_ARCHITECTURE_VISION.md §9): every ranked
// signal states, in a few words, why it landed where it did — including
// an explicit hedge when confidence is low, so a weak assumption is never
// silently presented with the same authority as a certain fact.
function explainScore(signal: IntelligenceSignal): string {
  const parts: string[] = [];
  if (signal.importance >= 0.7) parts.push("חשיבות גבוהה");
  else if (signal.importance <= 0.4) parts.push("חשיבות נמוכה");

  if (signal.confidence < 0.5) parts.push("ביטחון נמוך — יש להתייחס בזהירות");
  else if (signal.confidence >= 0.85) parts.push("ביטחון גבוה");

  return parts.length > 0 ? parts.join(", ") : "עדיפות בינונית";
}

// Stage 3 of the pipeline (docs/ATLAS_ARCHITECTURE_VISION.md §9): combines
// importance/confidence/recency into one comparable score and produces a
// stable, fully deterministic ordering. Relies on Array.prototype.sort
// being a stable sort (guaranteed by the spec since ES2019, and true in
// every JS engine this project runs on) for the final tie-break — two
// signals with identical score *and* identical category priority keep
// their original relative order rather than being reshuffled.
export function rankSignals(signals: IntelligenceSignal[]): RankedSignal[] {
  return signals
    .map((signal) => ({ ...signal, score: computeScore(signal), reason: explainScore(signal) }))
    .sort((a, b) => b.score - a.score || categoryPriorityIndex(a.category) - categoryPriorityIndex(b.category));
}
