"use client";

// A resource is "downloaded" once both halves of its offline content sit in
// the persisted query cache: the step brief (step-content) and the
// masterclass lesson (lesson/generate), for the picker variant this device
// currently has selected. Both are already the exact same cache the passive
// hover-prefetch (lib/learning/lessonPrefetch.ts) and the classroom itself
// read from — this only adds an explicit, user-triggered "make sure it's
// there" action instead of hoping a hover happened first, and it generates
// on a miss rather than only reading a cache hit.

import type { QueryClient } from "@tanstack/react-query";
import type { LessonGenerateResponse } from "@/app/api/learning/lesson/generate/route";
import type { StepContentDoneEvent } from "@/app/api/learning/step-content/route";
import { readAiError } from "@/lib/api/aiClient";
import { readSseStream } from "@/lib/learning/sseClient";
import { readStoredAgeGroup, readStoredTeachingMode } from "@/lib/learning/masterclassPrefs";
import { lessonQueryKey, stepBriefQueryKey } from "@/lib/query/offlineKeys";

export function isResourceDownloaded(queryClient: QueryClient, topicId: string, stepId: string): boolean {
  const lesson = queryClient.getQueryData(lessonQueryKey(topicId, stepId, readStoredAgeGroup(), readStoredTeachingMode()));
  const brief = queryClient.getQueryData(stepBriefQueryKey(stepId));
  return lesson != null && brief != null;
}

async function ensureBrief(queryClient: QueryClient, topicId: string, stepId: string): Promise<void> {
  if (queryClient.getQueryData(stepBriefQueryKey(stepId)) != null) return;
  const res = await fetch("/api/learning/step-content", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ topicId, stepId }),
  });
  if (!res.ok) throw new Error((await readAiError(res, "")).message);
  let landed = false;
  await readSseStream(res, (event, data) => {
    if (event === "done") {
      landed = true;
      queryClient.setQueryData(stepBriefQueryKey(stepId), (data as StepContentDoneEvent).content);
    } else if (event === "error") {
      throw new Error((data as { error?: string }).error ?? "step brief generation failed");
    }
  });
  if (!landed) throw new Error("step brief stream ended with no result");
}

async function ensureLesson(queryClient: QueryClient, topicId: string, stepId: string): Promise<void> {
  const ageGroup = readStoredAgeGroup();
  const teachingMode = readStoredTeachingMode();
  const key = lessonQueryKey(topicId, stepId, ageGroup, teachingMode);
  if (queryClient.getQueryData(key) != null) return;
  const res = await fetch("/api/learning/lesson/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ topicId, stepId, userAgeGroup: ageGroup, teachingMode }),
  });
  if (!res.ok) throw new Error((await readAiError(res, "")).message);
  let landed = false;
  await readSseStream(res, (event, data) => {
    if (event === "done") {
      const body = data as LessonGenerateResponse;
      if (body?.content) {
        landed = true;
        queryClient.setQueryData(key, body.content);
      }
    } else if (event === "error") {
      throw new Error((data as { error?: string }).error ?? "lesson generation failed");
    }
  });
  if (!landed) throw new Error("lesson stream ended with no result");
}

/** Generates whichever half is missing (a cache hit is a no-op) and lands both in the persisted offline cache. */
export async function downloadResourceForOffline(queryClient: QueryClient, topicId: string, stepId: string): Promise<void> {
  await Promise.all([ensureBrief(queryClient, topicId, stepId), ensureLesson(queryClient, topicId, stepId)]);
}
