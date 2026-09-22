import type { LearningResource, LearningResourceType, LearningTopic } from "@/types";

// Progression for the learning lab: XP and levels.
//
// Derived, never stored. That is the same rule the practice battle follows
// ("XP stays computed from history"), and it is what keeps this honest: there is
// no counter to drift, nothing to migrate, and un-ticking a resource takes its
// XP back rather than leaving a number that no longer matches the checklist.
// The floating "+50" the lab shows is feedback about a change in these totals.

/** What finishing one resource is worth — more for the heavier kinds. */
export const RESOURCE_XP: Record<LearningResourceType, number> = {
  youtube: 50,
  podcast: 40,
  article: 30,
  summary: 25,
  equipment: 10,
};

/** Finishing every resource in a topic is its own achievement. */
export const TOPIC_COMPLETE_BONUS = 100;

export function xpForResource(type: LearningResourceType): number {
  return RESOURCE_XP[type] ?? 0;
}

export interface TopicProgress {
  done: number;
  total: number;
  /** 0..1 */
  fraction: number;
  /** A topic with no resources is not complete — there is nothing to have finished. */
  complete: boolean;
}

export function topicProgress(resources: readonly Pick<LearningResource, "isCompleted">[]): TopicProgress {
  const total = resources.length;
  const done = resources.filter((r) => r.isCompleted).length;
  return { done, total, fraction: total === 0 ? 0 : done / total, complete: total > 0 && done === total };
}

export function topicXp(resources: readonly Pick<LearningResource, "isCompleted" | "type">[]): number {
  const earned = resources.filter((r) => r.isCompleted).reduce((sum, r) => sum + xpForResource(r.type), 0);
  return earned + (topicProgress(resources).complete ? TOPIC_COMPLETE_BONUS : 0);
}

/**
 * XP needed to *reach* a level: 0, 100, 300, 600, 1000, … (50·L·(L−1)). Each
 * level asks for one more "step" than the last, so early levels come quickly
 * and later ones are earned.
 */
export function levelThreshold(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 50 * l * (l - 1);
}

export function levelFor(xp: number): number {
  const safe = Math.max(0, xp);
  let level = 1;
  while (levelThreshold(level + 1) <= safe) level++;
  return level;
}

export interface LabStats {
  xp: number;
  level: number;
  /** XP earned within the current level. */
  xpIntoLevel: number;
  /** XP the current level spans. */
  xpForNext: number;
  /** 0..1 progress toward the next level. */
  levelFraction: number;
  totalTopics: number;
  completedTopics: number;
  totalResources: number;
  completedResources: number;
}

/** Everything the header shows, from the topics and resources as they stand. */
export function labStats(topics: readonly LearningTopic[], resources: readonly LearningResource[]): LabStats {
  const byTopic = new Map<string, LearningResource[]>();
  for (const topic of topics) byTopic.set(topic.id, []);
  // A resource whose topic is gone earns nothing: it is not on any checklist.
  for (const resource of resources) byTopic.get(resource.topicId)?.push(resource);

  let xp = 0;
  let completedTopics = 0;
  let totalResources = 0;
  let completedResources = 0;
  for (const list of byTopic.values()) {
    xp += topicXp(list);
    totalResources += list.length;
    const progress = topicProgress(list);
    completedResources += progress.done;
    if (progress.complete) completedTopics++;
  }

  const level = levelFor(xp);
  const floor = levelThreshold(level);
  const span = levelThreshold(level + 1) - floor;
  return {
    xp,
    level,
    xpIntoLevel: xp - floor,
    xpForNext: span,
    levelFraction: span === 0 ? 0 : (xp - floor) / span,
    totalTopics: topics.length,
    completedTopics,
    totalResources,
    completedResources,
  };
}

export type Celebration = "none" | "milestone" | "topic" | "level";

/**
 * How big a moment a completion is, so the UI can scale its reaction: a
 * resource ticked is a chime and a "+XP"; finishing the topic adds fireworks;
 * crossing into a new level outranks both. Un-ticking (XP going down) is never
 * a celebration.
 */
export function celebrationFor(input: {
  topicWasComplete: boolean;
  topicIsComplete: boolean;
  xpBefore: number;
  xpAfter: number;
}): Celebration {
  if (input.xpAfter <= input.xpBefore) return "none";
  if (levelFor(input.xpAfter) > levelFor(input.xpBefore)) return "level";
  if (input.topicIsComplete && !input.topicWasComplete) return "topic";
  return "milestone";
}
