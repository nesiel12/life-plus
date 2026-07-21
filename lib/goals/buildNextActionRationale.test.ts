import { describe, expect, it } from "vitest";
import { buildNextActionRationale } from "@/lib/goals/buildNextActionRationale";

function input(patch: Partial<Parameters<typeof buildNextActionRationale>[0]> = {}) {
  return {
    stage: "in_progress" as const,
    isWeakestLifeArea: false,
    hasRelatedMemory: false,
    taskSizePreference: null,
    ...patch,
  };
}

describe("buildNextActionRationale", () => {
  it("prioritizes a stuck goal above every other signal", () => {
    const rationale = buildNextActionRationale(
      input({ stage: "stuck", isWeakestLifeArea: true, hasRelatedMemory: true })
    );
    expect(rationale).toContain("לא זז");
  });

  it("mentions the weakest life area when the goal isn't stuck", () => {
    const rationale = buildNextActionRationale(input({ isWeakestLifeArea: true, hasRelatedMemory: true }));
    expect(rationale).toContain("המדד הכי נמוך");
  });

  it("mentions related history when nothing more pressing applies", () => {
    const rationale = buildNextActionRationale(input({ hasRelatedMemory: true }));
    expect(rationale).toContain("היסטוריה רלוונטית");
  });

  it("mentions a confident small-tasks preference as a last resort before the generic fallback", () => {
    const rationale = buildNextActionRationale(
      input({ taskSizePreference: { value: "smallTasks", confidence: 0.8 } })
    );
    expect(rationale).toContain("צעד אחד קטן");
  });

  it("falls back to a plain, honest statement when no real signal applies", () => {
    expect(buildNextActionRationale(input())).toBe("זו אבן הדרך הבאה בתור ביעד.");
  });
});
