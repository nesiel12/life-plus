"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { LessonGenerateResponse } from "@/app/api/learning/lesson/generate/route";
import { lessonQueryKey } from "@/lib/query/aiContentKeys";
import { readStoredAgeGroup, readStoredTeachingMode } from "@/lib/learning/masterclassPrefs";
import type { LessonBlockContent } from "@/types/learning";
import type { LearningResource } from "@/types";

async function fetchCachedLesson(topicId: string, stepId: string, ageGroup: string, teachingMode: string, signal: AbortSignal): Promise<LessonBlockContent> {
  const params = new URLSearchParams({ topicId, stepId, userAgeGroup: ageGroup, teachingMode });
  const res = await fetch(`/api/learning/lesson/generate?${params}`, { signal });
  // 404 = never generated. Throwing (rather than caching null) leaves the
  // key empty, so a later hover checks again once the lesson exists.
  if (!res.ok) throw new Error(`cached lesson read failed: ${res.status}`);
  const body = (await res.json()) as LessonGenerateResponse;
  return body.content;
}

/**
 * Hover/focus intent on "open lesson": pull the exact variant the classroom
 * will ask for (the person's remembered pickers) into the query cache, and
 * warm the classroom's code-split chunk. Cache-only on the server — a lesson
 * that was never generated stays ungenerated until it is actually opened, so
 * sweeping the mouse over a syllabus spends no AI quota.
 */
export function prefetchLesson(queryClient: QueryClient, topicId: string, stepId: string): void {
  void import("@/components/features/learning/classroom/ClassroomViewport");
  const ageGroup = readStoredAgeGroup();
  const teachingMode = readStoredTeachingMode();
  void queryClient.prefetchQuery({
    queryKey: lessonQueryKey(topicId, stepId, ageGroup, teachingMode),
    queryFn: ({ signal }) => fetchCachedLesson(topicId, stepId, ageGroup, teachingMode, signal),
    staleTime: Infinity,
    retry: false,
  });
}

/** Handlers for an "open lesson" control: prefetch on pointer hover and keyboard focus. */
export function useLessonPrefetchHandlers(resource: Pick<LearningResource, "id" | "topicId">) {
  const client = useQueryClient();
  const prefetch = useCallback(() => prefetchLesson(client, resource.topicId, resource.id), [client, resource.topicId, resource.id]);
  return { onMouseEnter: prefetch, onFocus: prefetch };
}
