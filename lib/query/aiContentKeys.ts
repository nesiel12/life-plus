import type { Query } from "@tanstack/react-query";
import type { TeachingMode, UserAgeGroup } from "@/types/learning";

// Every query under this prefix holds finished AI output that the server has
// already cached (learning_lesson_contents / learning_step_content). Only
// these are written to IndexedDB: they are immutable once generated, which is
// what makes staleTime: Infinity and offline reads correct for them. Anything
// else the app ever puts in React Query stays in memory.
export const AI_CONTENT = "ai-content";

/** Mirrors the server's cache key — learning_lesson_contents is unique on exactly these. */
export function lessonQueryKey(topicId: string, stepId: string, ageGroup: UserAgeGroup, teachingMode: TeachingMode) {
  return [AI_CONTENT, "lesson", topicId, stepId, ageGroup, teachingMode] as const;
}

export function stepBriefQueryKey(stepId: string) {
  return [AI_CONTENT, "step-brief", stepId] as const;
}

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.queryKey[0] === AI_CONTENT && query.state.status === "success" && query.state.data != null;
}
