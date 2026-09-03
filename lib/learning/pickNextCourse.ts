import { youtubeVideoId } from "@/lib/learning/youtube";
import type { LearningResource, LearningTopic } from "@/types";

export interface NextCourse {
  topic: LearningTopic;
  resource: LearningResource;
  videoId: string;
}

// The dashboard's "next Video Course to watch" (Sprint 6, the Unified
// Dashboard) — a real, deterministic pick, same spirit as pickNextReview:
// no invented "recommended for you" ranking, just the first genuinely
// resumable YouTube resource. "Resumable" means three real conditions, not
// one: not yet completed, an actual YouTube URL the in-app player
// (lib/learning/youtube.ts) can resolve to a video id, and belonging to a
// topic the user hasn't marked done — a completed topic's leftover
// unwatched resource isn't "next," it's stale.
//
// Active topics are preferred over planning ones (a topic already being
// worked is more "next" than one merely queued); within a tier, resources
// are considered oldest-created-first — the one queued longest, matching
// pickNextReview's own "least recently touched wins" reasoning applied to
// creation order instead.
export function pickNextCourse(topics: LearningTopic[], resources: LearningResource[]): NextCourse | null {
  const topicById = new Map(topics.map((t) => [t.id, t]));

  const candidates = resources
    .filter((r) => r.type === "youtube" && !r.isCompleted)
    .map((resource) => {
      const topic = topicById.get(resource.topicId);
      const videoId = resource.url ? youtubeVideoId(resource.url) : null;
      return topic && topic.status !== "completed" && videoId ? { topic, resource, videoId } : null;
    })
    .filter((c): c is NextCourse => c !== null);

  if (candidates.length === 0) return null;

  const rank = (topic: LearningTopic) => (topic.status === "active" ? 0 : 1);
  return candidates.reduce((best, candidate) => {
    const rankDiff = rank(candidate.topic) - rank(best.topic);
    if (rankDiff !== 0) return rankDiff < 0 ? candidate : best;
    const createdDiff = new Date(candidate.resource.createdAt).getTime() - new Date(best.resource.createdAt).getTime();
    return createdDiff < 0 ? candidate : best;
  });
}
