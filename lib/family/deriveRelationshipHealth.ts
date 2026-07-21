import type { RelationshipHealth } from "@/lib/family/types";

export interface RelationshipHealthInput {
  daysSinceLastInteraction: number | null;
  staleThresholdDays: number;
  recentCount: number;
  previousCount: number;
}

// The one place "is this person overdue for contact" is decided — shared
// with lib/context/buildAtlasContext.ts's relationshipSignals, which
// previously had its own independent inline copy of this exact condition
// (docs/BACKLOG.md flagged the duplication; Family Experience v2 closes it
// rather than adding a third copy here).
export function isPersonStale(daysSinceLastInteraction: number | null, staleThresholdDays: number): boolean {
  return daysSinceLastInteraction !== null && daysSinceLastInteraction >= staleThresholdDays;
}

// Mirrors lib/areas/deriveAttentionLevel.ts's three-tier shape and
// reasoning, applied to a relationship instead of a life area: no history
// yet is neutral (a brand-new contact isn't "at risk"), overdue-per-the-
// user's-own-threshold always means attention is needed, and a declining
// interaction trend keeps an otherwise-recent relationship from reading as
// fully healthy.
export function deriveRelationshipHealth({
  daysSinceLastInteraction,
  staleThresholdDays,
  recentCount,
  previousCount,
}: RelationshipHealthInput): RelationshipHealth {
  if (daysSinceLastInteraction === null) return "growing";
  if (isPersonStale(daysSinceLastInteraction, staleThresholdDays)) return "needs_attention";
  if (recentCount >= previousCount) return "healthy";
  return "growing";
}
