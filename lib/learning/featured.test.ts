import { describe, expect, it } from "vitest";
import { pickFeaturedTopic } from "@/lib/learning/featured";
import type { LearningResource, LearningTopic } from "@/types";

const topic = (id: string): LearningTopic => ({ id, title: id, status: "active", createdAt: "2026-09-01T00:00:00Z" });
const res = (id: string, topicId: string, isCompleted: boolean): LearningResource => ({
  id, topicId, type: "article", title: id, isCompleted, createdAt: "2026-09-01T00:00:00Z",
});

describe("pickFeaturedTopic", () => {
  it("has nothing to feature in an empty lab", () => {
    expect(pickFeaturedTopic([], [])).toBeNull();
  });

  it("features a topic that is partway through", () => {
    expect(pickFeaturedTopic([topic("a")], [res("1", "a", true), res("2", "a", false)])).toBe("a");
  });

  it("skips topics that are empty, untouched or finished", () => {
    const topics = ["empty", "fresh", "done"].map(topic);
    const resources = [res("f1", "fresh", false), res("d1", "done", true)];
    expect(pickFeaturedTopic(topics, resources)).toBeNull();
  });

  it("prefers the one with the most to show, and the earlier one on a tie", () => {
    const topics = ["small", "big", "alsoBig"].map(topic);
    const resources = [
      res("s1", "small", true), res("s2", "small", false),
      res("b1", "big", true), res("b2", "big", false), res("b3", "big", false),
      res("c1", "alsoBig", true), res("c2", "alsoBig", false), res("c3", "alsoBig", false),
    ];
    expect(pickFeaturedTopic(topics, resources)).toBe("big");
  });
});
