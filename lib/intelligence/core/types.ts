// Pure types only — zero runtime imports. The Atlas Intelligence Engine
// (docs/ATLAS_ARCHITECTURE_VISION.md §9) operates entirely on data the
// Context Engine has already fetched (AtlasContext) — it needs no DB
// access of its own, so the whole module stays this simple and testable.
export type SignalCategory =
  | "personalDNA"
  | "personalPattern"
  | "goal"
  | "lifeArea"
  | "upcomingEvent"
  | "relationship"
  | "memory"
  | "recommendation";

// The universal internal language every intelligence source gets
// normalized into (docs/ATLAS_ARCHITECTURE_VISION.md §9 "Stage 2:
// Normalize"). `summary` is already prompt-ready text — AtlasContext's
// fields arrive pre-formatted, so normalization doesn't re-derive prose,
// only classifies and scores it.
export interface IntelligenceSignal {
  id: string;
  category: SignalCategory;
  source: string; // which subsystem produced it, e.g. "memory-engine"
  title: string; // short label, e.g. "יעד פעיל"
  summary: string; // the actual content
  importance: number; // 0..1 — does this generally matter
  confidence: number; // 0..1 — how sure Atlas is this is true/relevant
  recency: number; // 0..1 — how fresh; see rank.ts for v1's honest limitation here
  metadata?: Record<string, unknown>;
}

// A signal after ranking — score and reason are always present, never
// optional, because a signal that's been through rankSignals always has
// both (docs/ATLAS_ARCHITECTURE_VISION.md §9 "Explainability": every
// ranked signal can answer "why is this here").
export interface RankedSignal extends IntelligenceSignal {
  score: number;
  reason: string;
}

export interface PriorityConflict {
  signalIds: [string, string];
  note: string;
}
