// Pure types only — zero runtime imports of server-only modules, so any
// file (including ones that must stay unit-testable, like
// lib/chatSystemPrompt.ts) can import AtlasContext without accidentally
// pulling in DB access.
import type { Database } from "@/types/database";
import type { LifeArea } from "@/types";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];

// The Context Engine's output (docs/ATLAS_ARCHITECTURE_VISION.md §5) — the
// one shape every AI-backed route consumes instead of independently
// fetching and formatting personalDNA/goals/memory/etc. Every field is
// already the "formatted for a prompt" version of its source data (plain
// label strings, not raw rows) so callers don't need to know the
// underlying entity shapes, the same pattern retrieveRelevantMemory
// already established.
export interface AtlasContext {
  personalDNA: PersonalDnaRow | null;
  activeGoals: string[];
  lifeAreas: LifeArea[];
  upcomingEvents: string[];
  relevantMemory: string[];
  relationshipSignals: string[];
  // Confident, explainable beliefs about the user's behavioral patterns —
  // Personal DNA Engine v1 (docs/ATLAS_ARCHITECTURE_VISION.md §3), already
  // filtered to MIN_CONFIDENCE_TO_SURFACE. Distinct from personalDNA above:
  // that's what the user told Atlas at onboarding; this is what Atlas has
  // inferred from watching his actual behavior since.
  personalPatterns: string[];
}

export interface BuildContextOptions {
  // Drives relevantMemory's relevance ranking (lib/memory/retrieveMemory.ts).
  // Omit to skip memory retrieval entirely (e.g. calendar suggestions has
  // no natural-language query to rank against).
  query?: string;
  memoryLimit?: number;
}
