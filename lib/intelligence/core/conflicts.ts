import type { RankedSignal, PriorityConflict, SignalCategory } from "@/lib/intelligence/core/types";

// Stage 4 of the pipeline (docs/ATLAS_ARCHITECTURE_VISION.md §9) — scoped
// honestly. True temporal conflict detection ("this suggestion collides
// with a real calendar slot") would need structured start/end times on
// every signal type; most (goals, relationships, memory, personalDNA)
// don't carry one — AtlasContext's fields are already-formatted prose by
// the time they reach this module (see normalize.ts's header comment).
// What v1 detects instead, honestly: *priority competition* — among the
// signals that actually made it to the top of the ranking (what Atlas
// would actually mention), categories that routinely compete for the same
// attention (a pressing goal vs. an overdue relationship vs. a dated
// commitment) get flagged, so Atlas (or a future caller) knows it's
// choosing between real priorities, not that a schedule literally
// collides. Deliberately checked against the top of the ranking rather
// than an absolute score threshold — an absolute cutoff would have to be
// tuned against every category's default importance/confidence (rank.ts),
// which turns into the same "no route should hardcode what matters"
// problem this engine exists to solve.
const TOP_N_FOR_CONFLICT_CHECK = 5;

const COMPETING_CATEGORY_PAIRS: [SignalCategory, SignalCategory][] = [
  ["goal", "relationship"],
  ["goal", "upcomingEvent"],
  ["relationship", "upcomingEvent"],
];

function isCompetingPair(a: SignalCategory, b: SignalCategory): boolean {
  return COMPETING_CATEGORY_PAIRS.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function detectPriorityConflicts(rankedSignals: RankedSignal[]): PriorityConflict[] {
  const topSignals = rankedSignals.slice(0, TOP_N_FOR_CONFLICT_CHECK);
  const conflicts: PriorityConflict[] = [];

  for (let i = 0; i < topSignals.length; i++) {
    for (let j = i + 1; j < topSignals.length; j++) {
      const a = topSignals[i];
      const b = topSignals[j];
      if (!isCompetingPair(a.category, b.category)) continue;
      conflicts.push({
        signalIds: [a.id, b.id],
        note: `שני איתותים בעדיפות גבוהה מתחרים על תשומת הלב: "${a.title}" ו"${b.title}".`,
      });
    }
  }

  return conflicts;
}
