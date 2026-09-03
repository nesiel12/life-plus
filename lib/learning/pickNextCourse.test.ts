import { describe, expect, it } from "vitest";
import { pickNextCourse } from "@/lib/learning/pickNextCourse";
import type { LearningResource, LearningTopic } from "@/types";

function topic(overrides: Partial<LearningTopic> & Pick<LearningTopic, "id" | "title">): LearningTopic {
  return { status: "active", createdAt: "2026-09-01T00:00:00Z", ...overrides };
}

function resource(
  overrides: Partial<LearningResource> & Pick<LearningResource, "id" | "topicId">
): LearningResource {
  return {
    type: "youtube",
    title: "r",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    isCompleted: false,
    createdAt: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("pickNextCourse", () => {
  it("returns null with no resources", () => {
    expect(pickNextCourse([], [])).toBeNull();
  });

  it("picks the only resumable resource", () => {
    const t = topic({ id: "t1", title: "פייתון" });
    const r = resource({ id: "r1", topicId: "t1" });
    const result = pickNextCourse([t], [r]);
    expect(result?.topic).toBe(t);
    expect(result?.resource).toBe(r);
    expect(result?.videoId).toBe("dQw4w9WgXcQ");
  });

  it("skips a completed resource", () => {
    const t = topic({ id: "t1", title: "א" });
    const r = resource({ id: "r1", topicId: "t1", isCompleted: true });
    expect(pickNextCourse([t], [r])).toBeNull();
  });

  it("skips a non-youtube resource", () => {
    const t = topic({ id: "t1", title: "א" });
    const r = resource({ id: "r1", topicId: "t1", type: "article", url: "https://example.com" });
    expect(pickNextCourse([t], [r])).toBeNull();
  });

  it("skips a resource with no resolvable video id", () => {
    const t = topic({ id: "t1", title: "א" });
    const r = resource({ id: "r1", topicId: "t1", url: "https://example.com/not-youtube" });
    expect(pickNextCourse([t], [r])).toBeNull();
  });

  it("skips a resource with no url at all", () => {
    const t = topic({ id: "t1", title: "א" });
    const r = resource({ id: "r1", topicId: "t1", url: undefined });
    expect(pickNextCourse([t], [r])).toBeNull();
  });

  it("skips a resource whose topic is already completed", () => {
    const t = topic({ id: "t1", title: "א", status: "completed" });
    const r = resource({ id: "r1", topicId: "t1" });
    expect(pickNextCourse([t], [r])).toBeNull();
  });

  it("skips a resource whose topic doesn't exist (orphaned)", () => {
    const r = resource({ id: "r1", topicId: "missing" });
    expect(pickNextCourse([], [r])).toBeNull();
  });

  it("prefers an active topic's resource over a planning topic's", () => {
    const active = topic({ id: "t1", title: "פעיל", status: "active" });
    const planning = topic({ id: "t2", title: "בתכנון", status: "planning" });
    const planningResource = resource({ id: "r1", topicId: "t2", createdAt: "2026-08-01T00:00:00Z" });
    const activeResource = resource({ id: "r2", topicId: "t1", createdAt: "2026-09-01T00:00:00Z" });
    const result = pickNextCourse([active, planning], [planningResource, activeResource]);
    expect(result?.resource.id).toBe("r2");
  });

  it("falls back to a planning topic when no active topic has a resumable resource", () => {
    const planning = topic({ id: "t1", title: "בתכנון", status: "planning" });
    const r = resource({ id: "r1", topicId: "t1" });
    const result = pickNextCourse([planning], [r]);
    expect(result?.resource.id).toBe("r1");
  });

  it("within the same tier, picks the resource created longest ago", () => {
    const t = topic({ id: "t1", title: "א" });
    const older = resource({ id: "r1", topicId: "t1", createdAt: "2026-06-01T00:00:00Z" });
    const newer = resource({ id: "r2", topicId: "t1", createdAt: "2026-09-01T00:00:00Z" });
    const result = pickNextCourse([t], [newer, older]);
    expect(result?.resource.id).toBe("r1");
  });
});
