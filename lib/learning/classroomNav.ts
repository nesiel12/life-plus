import type { LearningResource } from "@/types";

// The Classroom Viewport's step-to-step stepping (ClassroomNavBar.tsx's
// Previous/Next), pulled out as a pure function so the boundary behavior —
// null past either end, an id that isn't in the list — is unit-testable
// without mounting the component.

export type StepDirection = "prev" | "next";

/**
 * The resource id adjacent to `activeStepId` in `resources`' own order, or
 * null if there isn't one (already at an end, the topic has one step, or
 * `activeStepId` isn't in `resources` at all — the syllabus changed under
 * the open classroom, say).
 */
export function getAdjacentStepId(resources: readonly LearningResource[], activeStepId: string, direction: StepDirection): string | null {
  const index = resources.findIndex((r) => r.id === activeStepId);
  if (index === -1) return null;
  const adjacentIndex = direction === "next" ? index + 1 : index - 1;
  return resources[adjacentIndex]?.id ?? null;
}
