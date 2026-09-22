import { topicProgress } from "@/lib/learning/xp";
import type { LearningResource, LearningTopic } from "@/types";

/**
 * The topic worth showing wide: one you are partway through, with the most to
 * show (its resource count breaks ties toward the earlier topic).
 *
 * A wide card previews the syllabus, so it is wasted on an empty topic or a
 * finished one; and a finished or untouched topic is not where someone's
 * attention belongs. With nothing in progress there is no featured card, and
 * the grid is simply even.
 */
export function pickFeaturedTopic(topics: readonly LearningTopic[], resources: readonly LearningResource[]): string | null {
  let best: { id: string; count: number } | null = null;
  for (const topic of topics) {
    const own = resources.filter((r) => r.topicId === topic.id);
    const progress = topicProgress(own);
    if (progress.done === 0 || progress.complete) continue;
    if (!best || own.length > best.count) best = { id: topic.id, count: own.length };
  }
  return best?.id ?? null;
}
