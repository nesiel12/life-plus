import type { AtlasContext } from "@/lib/context/types";
import type { IntelligenceSignal, SignalCategory } from "@/lib/intelligence/core/types";

// Baseline importance/confidence per category — a deliberate, documented
// simplification. AtlasContext's fields arrive as already-formatted
// strings (lib/context/types.ts's own design: "callers don't need to know
// the underlying entity shapes"), which means the original per-item
// numeric confidence/evidence some of these came from (e.g. a
// personalPattern's real confidence score) was already discarded before
// reaching this boundary. Recovering it would mean widening AtlasContext's
// contract for every existing consumer just to serve this one — not
// justified yet. These defaults instead encode *category-level* trust:
// a stated preference (personalDNA) is more certain than an inferred
// pattern; a dated commitment (upcomingEvent) is more certain than a
// retrieved memory that may no longer be current.
const CATEGORY_DEFAULTS: Record<SignalCategory, { importance: number; confidence: number }> = {
  personalDNA: { importance: 0.6, confidence: 0.9 },
  personalPattern: { importance: 0.55, confidence: 0.6 },
  goal: { importance: 0.7, confidence: 1 },
  lifeArea: { importance: 0.5, confidence: 1 },
  upcomingEvent: { importance: 0.75, confidence: 1 },
  relationship: { importance: 0.65, confidence: 1 },
  memory: { importance: 0.5, confidence: 0.7 },
  recommendation: { importance: 0.45, confidence: 0.8 },
};

// A life area sitting well below balance matters more to surface than one
// that's fine — the same "weakest area wins" rule calendar suggestions
// already ranks by (lib/api/calendar/suggestions/route.ts), expressed here
// as an importance boost instead of a bespoke sort. Exported so Goals
// Experience v2 (app/api/goals/insights) can flag a goal sitting in a weak
// life area using the exact same threshold, rather than picking a second
// number that means the same thing.
export const WEAK_LIFE_AREA_SCORE_THRESHOLD = 40;
const WEAK_LIFE_AREA_IMPORTANCE = 0.75;

interface SignalOverrides {
  importance?: number;
  confidence?: number;
}

function makeSignal(
  id: string,
  category: SignalCategory,
  source: string,
  title: string,
  summary: string,
  overrides?: SignalOverrides
): IntelligenceSignal {
  const defaults = CATEGORY_DEFAULTS[category];
  return {
    id,
    category,
    source,
    title,
    summary,
    importance: overrides?.importance ?? defaults.importance,
    confidence: overrides?.confidence ?? defaults.confidence,
    // Flat for v1 — see rank.ts's header comment for why real per-item
    // recency isn't recovered here either.
    recency: 1,
  };
}

// Stage 2 of the pipeline (docs/ATLAS_ARCHITECTURE_VISION.md §9): turns
// AtlasContext's already-gathered fields into the universal signal shape.
// Every AtlasContext field maps to exactly one category — this is where
// "which subsystem said this" gets recorded, once, instead of every route
// re-deciding it implicitly through which fields it happens to pick and in
// what order (the pre-engine pattern every consumer of AtlasContext used).
export function buildIntelligenceSignals(context: AtlasContext): IntelligenceSignal[] {
  const signals: IntelligenceSignal[] = [];
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}-${counter++}`;

  if (context.personalDNA) {
    const dna = context.personalDNA;
    if (dna.peak_focus_hours) {
      signals.push(makeSignal(nextId("dna"), "personalDNA", "personal_dna", "שעות ריכוז", dna.peak_focus_hours));
    }
    if (dna.learning_style) {
      signals.push(makeSignal(nextId("dna"), "personalDNA", "personal_dna", "סגנון למידה", dna.learning_style));
    }
    for (const note of dna.habit_notes) {
      signals.push(makeSignal(nextId("dna"), "personalDNA", "personal_dna", "הרגל", note));
    }
  }

  for (const pattern of context.personalPatterns) {
    signals.push(makeSignal(nextId("pattern"), "personalPattern", "personal-dna-engine", "דפוס התנהגות", pattern));
  }

  for (const goal of context.activeGoals) {
    signals.push(makeSignal(nextId("goal"), "goal", "goals-engine", "יעד פעיל", goal));
  }

  for (const area of context.lifeAreas) {
    const isWeak = area.score < WEAK_LIFE_AREA_SCORE_THRESHOLD;
    signals.push(
      makeSignal(nextId("area"), "lifeArea", "life-area-scores", area.label, `${area.label}: ${area.score}%`, {
        importance: isWeak ? WEAK_LIFE_AREA_IMPORTANCE : undefined,
      })
    );
  }

  for (const event of context.upcomingEvents) {
    signals.push(makeSignal(nextId("event"), "upcomingEvent", "upcoming-events", "אירוע קרוב", event));
  }

  for (const relationship of context.relationshipSignals) {
    signals.push(
      makeSignal(nextId("rel"), "relationship", "relationship-intelligence", "קשר משפחתי", relationship)
    );
  }

  for (const memory of context.relevantMemory) {
    signals.push(makeSignal(nextId("memory"), "memory", "memory-engine", "זיכרון רלוונטי", memory));
  }

  for (const insight of context.recommendationInsights) {
    signals.push(
      makeSignal(nextId("rec"), "recommendation", "recommendation-engine", "משוב על הצעות קודמות", insight)
    );
  }

  return signals;
}

export function filterSignalsByCategory(
  signals: IntelligenceSignal[],
  categories: SignalCategory[]
): IntelligenceSignal[] {
  const allowed = new Set(categories);
  return signals.filter((signal) => allowed.has(signal.category));
}
