import { describe, expect, it } from "vitest";
import { getAdjacentStepId } from "@/lib/learning/classroomNav";
import type { LearningResource } from "@/types";

const resource = (id: string): LearningResource => ({
  id,
  topicId: "t1",
  type: "summary",
  title: `שלב ${id}`,
  isCompleted: false,
  createdAt: "2026-09-01T00:00:00Z",
});

const resources = [resource("a"), resource("b"), resource("c")];

describe("getAdjacentStepId", () => {
  it("returns the next step", () => {
    expect(getAdjacentStepId(resources, "a", "next")).toBe("b");
  });

  it("returns the previous step", () => {
    expect(getAdjacentStepId(resources, "b", "prev")).toBe("a");
  });

  it("returns null past the last step", () => {
    expect(getAdjacentStepId(resources, "c", "next")).toBeNull();
  });

  it("returns null before the first step", () => {
    expect(getAdjacentStepId(resources, "a", "prev")).toBeNull();
  });

  it("returns null when the active step isn't in the list", () => {
    expect(getAdjacentStepId(resources, "missing", "next")).toBeNull();
  });

  it("returns null for a single-resource topic in either direction", () => {
    const single = [resource("only")];
    expect(getAdjacentStepId(single, "only", "next")).toBeNull();
    expect(getAdjacentStepId(single, "only", "prev")).toBeNull();
  });
});
