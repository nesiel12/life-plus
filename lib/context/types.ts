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
  // The user's real Google Calendar schedule, next 14 days (Smart Calendar
  // & Google Calendar Integration) — distinct from upcomingEvents above
  // (the curated "meaningful moments" concept). Always [] unless the
  // caller passed it in via BuildContextOptions.scheduledEvents: fetching
  // it needs the user's live Google access token, which this function
  // doesn't have (it's only ever given a userId) — see buildAtlasContext.ts.
  scheduledEvents: string[];
  relevantMemory: string[];
  relationshipSignals: string[];
  // Baseline "who's in his life," unconditional — unlike relationshipSignals
  // (only populated when something is actionable: stale contact, birthday
  // window), this always includes every real person on file so the system
  // prompt's own identity paragraph (lib/chatSystemPrompt.ts) can name them
  // dynamically instead of a hand-maintained, drifting hardcoded list.
  peopleRoster: string[];
  // Confident, explainable beliefs about the user's behavioral patterns —
  // Personal DNA Engine v1 (docs/ATLAS_ARCHITECTURE_VISION.md §3), already
  // filtered to MIN_CONFIDENCE_TO_SURFACE. Distinct from personalDNA above:
  // that's what the user told Atlas at onboarding; this is what Atlas has
  // inferred from watching his actual behavior since.
  personalPatterns: string[];
  // How past Atlas suggestions actually landed — Recommendation
  // Intelligence & Feedback Loop v1 (docs/ATLAS_ARCHITECTURE_VISION.md §7).
  // Only includes a recommendation type once it has enough responses to be
  // signal, e.g. "הצעות ליומן: מתקבלות בכ-80% מהמקרים."
  recommendationInsights: string[];
}

export interface BuildContextOptions {
  // Drives relevantMemory's relevance ranking (lib/memory/retrieveMemory.ts).
  // Omit to skip memory retrieval entirely (e.g. calendar suggestions has
  // no natural-language query to rank against).
  query?: string;
  memoryLimit?: number;
  // Pre-fetched by the caller (app/api/chat/route.ts), already formatted
  // ("Title (date, time)") — buildAtlasContext just includes whatever's
  // passed, defaulting to [] when omitted (no token available, or the
  // caller doesn't need calendar context, e.g. calendar suggestions
  // itself already has its own freeBusy data).
  scheduledEvents?: string[];
}
