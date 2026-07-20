// Pure types only — no runtime imports — mirrors lib/context/types.ts's
// reasoning: analyzers and the confidence model must stay unit-testable
// without pulling in DB access.
export type PatternCategory = "focus" | "learning" | "goals" | "routine";

// A pattern computed fresh from current data, before being reconciled
// against whatever is already stored (lib/intelligence/personalDNA/
// confidence.ts's resolvePatternUpdate). This is the analyzers' output
// shape — deterministic, explainable, no ML involved.
export interface PatternCandidate {
  category: PatternCategory;
  patternType: string;
  // Disambiguates multiple patterns of the same patternType per user (e.g.
  // one peakActivityWindow per life-area category). "" when not applicable
  // — see supabase/migrations/20260720000004_personal_patterns.sql for why
  // never null.
  subject: string;
  description: string; // Hebrew, human-readable — what surfaces into AI context
  value: string; // machine-comparable, used to detect a contradicting belief on update
  evidenceCount: number;
  strength: number; // 0..1 — how concentrated/clear the signal is in the data
  source: string; // which table(s) this was derived from
}
