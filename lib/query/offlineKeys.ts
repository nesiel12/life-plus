import type { Query } from "@tanstack/react-query";
import type { LearningResource, LearningTopic } from "@/types";
import type { TeachingMode, UserAgeGroup } from "@/types/learning";

// Everything under this prefix is written to IndexedDB and must be readable
// with no network: finished AI output the server has already cached
// (immutable once generated — which is what makes staleTime: Infinity
// correct for it) and the learning index needed to reach it on an offline
// cold start. Any other query stays in memory.
export const OFFLINE = "offline";

/** Mirrors the server's cache key — learning_lesson_contents is unique on exactly these. */
export function lessonQueryKey(topicId: string, stepId: string, ageGroup: UserAgeGroup, teachingMode: TeachingMode) {
  return [OFFLINE, "lesson", topicId, stepId, ageGroup, teachingMode] as const;
}

export function stepBriefQueryKey(stepId: string) {
  return [OFFLINE, "step-brief", stepId] as const;
}

/** The person's topics and their steps, as of the last online bootstrap. */
export interface LearningIndexSnapshot {
  topics: LearningTopic[];
  resources: LearningResource[];
  savedAt: string;
}

export const learningIndexQueryKey = [OFFLINE, "learning-index"] as const;

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.queryKey[0] === OFFLINE && query.state.status === "success" && query.state.data != null;
}
