// Deterministic confidence model — no ML, no external services. Every
// number here is explainable: "why do we believe this" always traces back
// to evidenceCount (how much data) and strength (how clean the signal is).

// Confidence never reaches 1.0 — Atlas should never present an inferred
// pattern as certain fact, only as a well-evidenced belief.
export const MAX_CONFIDENCE = 0.95;

// At EVIDENCE_HALF_SATURATION observations, evidenceFactor is exactly 0.5 —
// i.e. a pattern needs roughly this many data points before it's treated as
// even half-trustworthy, regardless of how clean the signal looks.
const EVIDENCE_HALF_SATURATION = 5;

// Applied when fresh analysis contradicts what was previously believed
// (the value changed) — the new belief starts out less trusted than a
// from-scratch calculation would suggest, until it's been consistent for a
// while (i.e. survives a few more analysis runs without flip-flopping).
const CONTRADICTION_DISCOUNT = 0.7;

// Patterns below this never get surfaced into AI context (lib/context/
// buildAtlasContext.ts) — stored, but not acted on. Weak assumptions stay
// internal until there's enough evidence to trust them.
export const MIN_CONFIDENCE_TO_SURFACE = 0.3;

// Deliberately not rounded here — this stays a full-precision float so the
// asymptotic approach to MAX_CONFIDENCE never actually rounds up to touch
// it. Storage (personal_patterns.confidence, numeric(4,3)) rounds on write.
export function calculatePatternConfidence(evidenceCount: number, strength: number): number {
  if (evidenceCount <= 0) return 0;
  const clampedStrength = Math.max(0, Math.min(1, strength));
  const evidenceFactor = evidenceCount / (evidenceCount + EVIDENCE_HALF_SATURATION);
  return clampedStrength * evidenceFactor * MAX_CONFIDENCE;
}

export interface StoredPatternRef {
  value: string;
  confidence: number;
}

export interface FreshPattern {
  value: string;
  evidenceCount: number;
  strength: number;
}

export interface ResolvedPattern {
  value: string;
  confidence: number;
  evidenceCount: number;
}

// The DNA-update step of the self-learning loop (docs/ATLAS_ARCHITECTURE_
// VISION.md §3): reconciles a freshly-computed pattern against what's
// already stored for that (category, patternType, subject). A new
// assumption starts low. The same belief recurring with more evidence
// climbs. A belief that flips outright is discounted rather than instantly
// trusted at face value.
export function resolvePatternUpdate(existing: StoredPatternRef | null, fresh: FreshPattern): ResolvedPattern {
  const freshConfidence = calculatePatternConfidence(fresh.evidenceCount, fresh.strength);

  if (!existing || existing.value === fresh.value) {
    return { value: fresh.value, confidence: freshConfidence, evidenceCount: fresh.evidenceCount };
  }

  return {
    value: fresh.value,
    confidence: freshConfidence * CONTRADICTION_DISCOUNT,
    evidenceCount: fresh.evidenceCount,
  };
}

// Selects which patterns are trustworthy enough to act on, highest
// confidence first — the one place "which beliefs do we surface" is
// decided, rather than every consumer re-deciding its own threshold.
export function rankPatterns<T extends { confidence: number }>(
  patterns: T[],
  limit = 5,
  minConfidence = MIN_CONFIDENCE_TO_SURFACE
): T[] {
  return patterns
    .filter((pattern) => pattern.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}
