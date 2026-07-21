import type { RecommendationOutcomeEvent, RecommendationStatus } from "@/lib/intelligence/recommendations/types";

// Deterministic feedback weighting — no ML. Range is -1..1: positive
// reinforces similar future recommendations, negative discourages them.
// "modified" is treated as a soft positive (the user engaged with and
// adapted the suggestion rather than rejecting it outright — the shape was
// roughly right, the specifics weren't). "expired" (an unanswered
// suggestion that timed out — Atlas's operational meaning of "ignored") is
// only ever a weak negative, per this project's explicit instruction to
// never treat silence as a strong rejection.
const FEEDBACK_WEIGHTS: Record<RecommendationStatus, number> = {
  pending: 0,
  accepted: 1,
  rejected: -1,
  modified: 0.3,
  expired: -0.2,
};

export function getFeedbackWeight(status: RecommendationStatus): number {
  return FEEDBACK_WEIGHTS[status];
}

// Only "pending" has any valid outgoing transition — once a user has
// responded (or a suggestion expired unanswered), that's final for v1;
// there's no "un-reject" flow. Enforced atomically in lib/db/
// recommendationEvents.ts's recordOutcome (a conditional UPDATE, not a
// read-then-write); this function is the explainable, testable statement
// of the same rule, not a second enforcement path.
const VALID_TRANSITIONS: Record<RecommendationStatus, RecommendationStatus[]> = {
  pending: ["accepted", "rejected", "modified", "expired"],
  accepted: [],
  rejected: [],
  modified: [],
  expired: [],
};

export function isValidStatusTransition(from: RecommendationStatus, to: RecommendationStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

// The confidence-adjustment step of the feedback loop (docs/ATLAS_
// ARCHITECTURE_VISION.md §7): averages feedback weight across a group of
// past events into a single -1..1 signal. Returns a plain number rather
// than writing anywhere — callers (a future Personal DNA consumer, or the
// Context Engine's insight formatting below) decide what to do with it,
// keeping this module decoupled from personal_patterns by design.
export function calculateFeedbackConfidenceAdjustment(events: { status: RecommendationStatus }[]): number {
  if (events.length === 0) return 0;
  const total = events.reduce((sum, event) => sum + getFeedbackWeight(event.status), 0);
  return total / events.length;
}

export interface RecommendationOutcomeSummary {
  type: string;
  totalCount: number;
  acceptedCount: number;
  rejectedCount: number;
  averageWeight: number; // -1..1
}

const MIN_EVENTS_FOR_SUMMARY = 3;

// Groups responded (non-pending) events by type and summarizes each
// group's outcome — the input to what surfaces as AtlasContext.
// recommendationInsights. A type with too few responses to be signal
// rather than noise is simply omitted, not reported with false confidence.
export function summarizeRecommendationOutcomes(
  events: RecommendationOutcomeEvent[]
): RecommendationOutcomeSummary[] {
  const byType = new Map<string, RecommendationOutcomeEvent[]>();
  for (const event of events) {
    const list = byType.get(event.type) ?? [];
    list.push(event);
    byType.set(event.type, list);
  }

  const summaries: RecommendationOutcomeSummary[] = [];
  for (const [type, list] of byType) {
    if (list.length < MIN_EVENTS_FOR_SUMMARY) continue;
    summaries.push({
      type,
      totalCount: list.length,
      acceptedCount: list.filter((event) => event.status === "accepted").length,
      rejectedCount: list.filter((event) => event.status === "rejected").length,
      averageWeight: calculateFeedbackConfidenceAdjustment(list),
    });
  }

  return summaries;
}
