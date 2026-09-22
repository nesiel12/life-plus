"use client";

import { useCallback } from "react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useLab, type Point } from "@/components/features/learning/lab/LabContext";
import { celebrationFor, labStats, topicProgress } from "@/lib/learning/xp";
import type { LearningResource } from "@/types";

/**
 * Ticking a resource done (or undone) — and reacting to it.
 *
 * One function for every place a resource can be completed: the syllabus
 * checkbox and a video played through to the end must feel the same and must
 * agree on what a completion is worth. The reaction is worked out from the
 * store as it stands *before* the change (so a level-up or a finished topic is
 * detected as a transition, not a state), fired at once, and then the store is
 * updated — which is optimistic, so the checklist and the XP counter move with
 * the animation rather than after it.
 *
 * Rejects if the update fails, having already celebrated; the store rolls the
 * row back, and the caller shows the error.
 */
export function useResourceCompletion() {
  const lab = useLab();
  const updateLearningResource = useAtlasStore((s) => s.updateLearningResource);

  return useCallback(
    async (resource: LearningResource, done: boolean, origin?: Point) => {
      const { learningTopics, learningResources } = useAtlasStore.getState();
      const before = labStats(learningTopics, learningResources);
      const next = learningResources.map((r) => (r.id === resource.id ? { ...r, isCompleted: done } : r));
      const after = labStats(learningTopics, next);

      const ofTopic = (list: readonly LearningResource[]) => list.filter((r) => r.topicId === resource.topicId);
      const kind = celebrationFor({
        topicWasComplete: topicProgress(ofTopic(learningResources)).complete,
        topicIsComplete: topicProgress(ofTopic(next)).complete,
        xpBefore: before.xp,
        xpAfter: after.xp,
      });

      if (kind !== "none") lab.celebrate(kind, after.xp - before.xp, origin, kind === "level" ? `רמה ${after.level}!` : undefined);
      await updateLearningResource(resource.id, { isCompleted: done });
    },
    [lab, updateLearningResource]
  );
}
