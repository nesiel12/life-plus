import type { EnergyGuidance, TaskIntensity } from "@/lib/dashboard/context";
import { buildTopicGraph } from "@/lib/learning/topicGraph";
import { recommendStudyTopics } from "@/lib/learning/energyRecommend";
import { topicProgress } from "@/lib/learning/xp";
import type { LearningResource, LearningTopic } from "@/types";

// הצעות למידה — the deterministic half of the Discovery feed: real signals
// already sitting in the lab's own data, no model call. (The other half — a
// brand-new topic idea, which by definition cannot come from data the user
// already has — is a real AI call; see app/api/ai/learning-lab/route.ts mode
// "suggestTopics" and the DiscoveryTab that renders it separately, clearly
// labelled as AI, next to these.)
//
// Every suggestion here carries the real reason it was made — same rule
// lib/family/neglect.ts's describeNeglect and lib/learning/topicGraph.ts's
// edge `reason` hold themselves to: a recommendation engine that cannot say
// why is not one a person can trust.

export type RecommendationReasonKind = "energy" | "momentum" | "stalled";

export interface TopicRecommendation {
  topic: LearningTopic;
  kind: RecommendationReasonKind;
  reason: string;
}

const MAX_RECOMMENDATIONS = 5;
const MAX_ENERGY_PICKS = 2;
const MAX_MOMENTUM_PICKS = 2;
const MAX_STALLED_PICKS = 2;

/** A topic that has resources but has barely been touched. */
const STALLED_FRACTION_CEILING = 0.15;
/** ...and has sat that way for at least this long — a brand-new topic added
 *  five minutes ago is not "stalled", it just hasn't been started yet. */
const STALLED_MIN_AGE_DAYS = 3;
const DAY_MS = 86_400_000;

/** A neighbour this far along is worth riding the momentum of. */
const MOMENTUM_NEIGHBOR_FRACTION = 0.8;

function topicsById(topics: readonly LearningTopic[]) {
  return new Map(topics.map((t) => [t.id, t]));
}

/** Topics with real content that have gone nearly untouched for a while. */
export function stalledTopics(topics: readonly LearningTopic[], resources: readonly LearningResource[], now: Date): TopicRecommendation[] {
  const ageMs = (t: LearningTopic) => now.getTime() - new Date(t.createdAt).getTime();

  return topics
    .filter((t) => t.status !== "completed" && ageMs(t) >= STALLED_MIN_AGE_DAYS * DAY_MS)
    .map((topic) => ({ topic, progress: topicProgress(resources.filter((r) => r.topicId === topic.id)) }))
    .filter(({ progress }) => progress.total > 0 && progress.fraction <= STALLED_FRACTION_CEILING)
    .sort((a, b) => a.progress.fraction - b.progress.fraction || ageMs(b.topic) - ageMs(a.topic))
    .slice(0, MAX_STALLED_PICKS)
    .map(({ topic, progress }) => ({
      topic,
      kind: "stalled" as const,
      reason:
        progress.done === 0
          ? "עדיין לא התחלת בנושא הזה — צעד ראשון קטן יספיק כדי לפרוץ קרח."
          : `התקדמת רק ב-${Math.round(progress.fraction * 100)}% — אולי הגיע הזמן לחזור אליו.`,
    }));
}

/**
 * A topic whose graph-neighbour (buildTopicGraph — a real, stated relation,
 * never invented) is almost finished, while the topic itself still has real
 * work left. Riding momentum from something you just nearly finished into
 * the thing it is genuinely related to.
 */
export function momentumTopics(topics: readonly LearningTopic[], resources: readonly LearningResource[]): TopicRecommendation[] {
  const { edges } = buildTopicGraph(topics, resources);
  const byId = topicsById(topics);
  const progressOf = (id: string) => topicProgress(resources.filter((r) => r.topicId === id));

  const seen = new Set<string>();
  const picks: TopicRecommendation[] = [];

  for (const edge of [...edges].sort((a, b) => b.weight - a.weight)) {
    for (const [fromId, toId] of [
      [edge.a, edge.b],
      [edge.b, edge.a],
    ]) {
      const from = progressOf(fromId);
      const to = progressOf(toId);
      const target = byId.get(toId);
      if (!target || seen.has(toId)) continue;
      if (from.total === 0 || from.fraction < MOMENTUM_NEIGHBOR_FRACTION) continue;
      if (to.total === 0 || to.fraction >= MOMENTUM_NEIGHBOR_FRACTION) continue;

      seen.add(toId);
      picks.push({
        topic: target,
        kind: "momentum",
        reason: `כמעט סיימת את "${byId.get(fromId)?.title}" — ${edge.reason}, וזה זמן טוב להמשיך הלאה.`,
      });
    }
  }

  return picks.slice(0, MAX_MOMENTUM_PICKS);
}

/** The one or two topics that best fit the energy you have right now. */
export function energyMatchedTopics(
  topics: readonly LearningTopic[],
  resources: readonly LearningResource[],
  intensity: TaskIntensity
): TopicRecommendation[] {
  return recommendStudyTopics(topics, resources, intensity)
    .filter((r) => r.fit === "match")
    .slice(0, MAX_ENERGY_PICKS)
    .map((r) => ({
      topic: r.topic,
      kind: "energy" as const,
      reason: r.demand === "deep" ? "זה חלון שיא — מתאים למשהו שדורש ריכוז." : "האנרגיה נמוכה עכשיו — זה מתאים למשהו קליל.",
    }));
}

/**
 * All three deterministic sources, deduplicated (a topic that already has an
 * energy-matched reason keeps that one — it is the most actionable "why now",
 * ahead of momentum and staleness) and capped for the feed.
 */
export function buildRecommendations(
  topics: readonly LearningTopic[],
  resources: readonly LearningResource[],
  energy: EnergyGuidance,
  now: Date
): TopicRecommendation[] {
  const seen = new Set<string>();
  const out: TopicRecommendation[] = [];

  for (const source of [
    energyMatchedTopics(topics, resources, energy.intensity),
    momentumTopics(topics, resources),
    stalledTopics(topics, resources, now),
  ]) {
    for (const rec of source) {
      if (seen.has(rec.topic.id)) continue;
      seen.add(rec.topic.id);
      out.push(rec);
    }
  }

  return out.slice(0, MAX_RECOMMENDATIONS);
}
