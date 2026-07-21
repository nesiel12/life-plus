// How confident Atlas is that a calendar suggestion is well-targeted: how
// far this life area's score lags behind the average of all areas — the
// same weakest-area signal the suggestion's ranking already uses (docs/
// ATLAS_ARCHITECTURE_VISION.md §9), expressed as a number instead of left
// implicit. Real and computed from data the caller already has; not a
// fabricated "AI confidence" score with no basis.
const BASE_CONFIDENCE = 0.5;
const MAX_CONFIDENCE = 0.95;

export function computeSuggestionConfidence(areaScore: number, allScores: number[]): number {
  if (allScores.length === 0) return BASE_CONFIDENCE;
  const average = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
  const gap = Math.max(0, average - areaScore);
  return Math.min(MAX_CONFIDENCE, BASE_CONFIDENCE + gap / 100);
}
