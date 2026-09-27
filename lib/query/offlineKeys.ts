import type { Query } from "@tanstack/react-query";
import type { HydratedState } from "@/store/useAtlasStore";
import type { TeachingMode, UserAgeGroup } from "@/types/learning";

// Everything under this prefix is written to IndexedDB and must be readable
// with no network: finished AI output the server has already cached
// (immutable once generated — which is what makes staleTime: Infinity
// correct for it) and the whole app bootstrap needed to use the rest of the
// app on an offline cold start. Any other query stays in memory.
export const OFFLINE = "offline";

/** Mirrors the server's cache key — learning_lesson_contents is unique on exactly these. */
export function lessonQueryKey(topicId: string, stepId: string, ageGroup: UserAgeGroup, teachingMode: TeachingMode) {
  return [OFFLINE, "lesson", topicId, stepId, ageGroup, teachingMode] as const;
}

export function stepBriefQueryKey(stepId: string) {
  return [OFFLINE, "step-brief", stepId] as const;
}

/**
 * A read-only snapshot of the ENTIRE bootstrap payload (getInitialState —
 * every domain, not just learning), as of the last time the app loaded
 * online. This is what lets an offline cold start open into the real app —
 * the calendar, finances, family, everything — instead of just the learning
 * hub. It is a point-in-time snapshot, not a live sync: nothing done offline
 * writes back into it or to the server (deliberately out of scope — see
 * lib/query/offlineStore.ts's header).
 */
export interface OfflineBootstrapSnapshot {
  state: HydratedState;
  savedAt: string;
}

export const offlineBootstrapQueryKey = [OFFLINE, "bootstrap"] as const;

export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.queryKey[0] === OFFLINE && query.state.status === "success" && query.state.data != null;
}
