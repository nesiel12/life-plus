import { describe, expect, it } from "vitest";
import { lessonQueryKey, shouldPersistQuery, stepBriefQueryKey } from "./offlineKeys";

const query = (queryKey: readonly unknown[], status: "success" | "error" | "pending", data: unknown) =>
  ({ queryKey, state: { status, data } }) as unknown as Parameters<typeof shouldPersistQuery>[0];

describe("shouldPersistQuery", () => {
  it("persists finished lessons and step briefs", () => {
    expect(shouldPersistQuery(query(lessonQueryKey("t", "s", "ADULTS_19_PLUS", "SOCRATIC"), "success", { originStory: "x" }))).toBe(true);
    expect(shouldPersistQuery(query(stepBriefQueryKey("s"), "success", { summary: "x" }))).toBe(true);
  });

  it("never persists anything outside the offline namespace", () => {
    expect(shouldPersistQuery(query(["step-brief-index", "t"], "success", { briefs: {} }))).toBe(false);
  });

  it("never persists a failed or empty query", () => {
    expect(shouldPersistQuery(query(stepBriefQueryKey("s"), "error", undefined))).toBe(false);
    expect(shouldPersistQuery(query(stepBriefQueryKey("s"), "success", null))).toBe(false);
  });
});

describe("learning index", () => {
  it("is persisted, so an offline cold start can list topics", async () => {
    const { learningIndexQueryKey } = await import("./offlineKeys");
    expect(shouldPersistQuery(query(learningIndexQueryKey, "success", { topics: [], resources: [], savedAt: "x" }))).toBe(true);
  });
});
