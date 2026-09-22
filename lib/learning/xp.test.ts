import { describe, expect, it } from "vitest";
import {
  RESOURCE_XP,
  TOPIC_COMPLETE_BONUS,
  celebrationFor,
  labStats,
  levelFor,
  levelThreshold,
  topicProgress,
  topicXp,
  xpForResource,
} from "@/lib/learning/xp";
import type { LearningResource, LearningTopic } from "@/types";

const topic = (id: string): LearningTopic => ({ id, title: `נושא ${id}`, status: "active", createdAt: "2026-09-01T00:00:00Z" });
const resource = (id: string, topicId: string, type: LearningResource["type"], isCompleted: boolean): LearningResource => ({
  id, topicId, type, title: `משאב ${id}`, isCompleted, createdAt: "2026-09-01T00:00:00Z",
});

describe("xpForResource", () => {
  it("pays more for the heavier kinds, and a video is the +50 the lab shows", () => {
    expect(xpForResource("youtube")).toBe(50);
    expect(xpForResource("youtube")).toBeGreaterThan(xpForResource("article"));
    expect(xpForResource("article")).toBeGreaterThan(xpForResource("equipment"));
    for (const xp of Object.values(RESOURCE_XP)) expect(xp).toBeGreaterThan(0);
  });
});

describe("topicProgress", () => {
  it("counts what is done", () => {
    expect(topicProgress([{ isCompleted: true }, { isCompleted: false }, { isCompleted: true }, { isCompleted: false }])).toEqual({
      done: 2, total: 4, fraction: 0.5, complete: false,
    });
  });

  it("does not call an empty topic complete", () => {
    expect(topicProgress([])).toEqual({ done: 0, total: 0, fraction: 0, complete: false });
  });

  it("is complete only when every resource is", () => {
    expect(topicProgress([{ isCompleted: true }]).complete).toBe(true);
    expect(topicProgress([{ isCompleted: true }, { isCompleted: false }]).complete).toBe(false);
  });
});

describe("topicXp", () => {
  it("sums finished resources, adding the bonus only for a finished topic", () => {
    const partial = [resource("a", "t", "youtube", true), resource("b", "t", "article", false)];
    expect(topicXp(partial)).toBe(50);
    const full = [resource("a", "t", "youtube", true), resource("b", "t", "article", true)];
    expect(topicXp(full)).toBe(50 + 30 + TOPIC_COMPLETE_BONUS);
  });

  it("takes XP back when something is un-ticked", () => {
    const done = [resource("a", "t", "youtube", true)];
    const undone = [resource("a", "t", "youtube", false)];
    expect(topicXp(done)).toBeGreaterThan(topicXp(undone));
    expect(topicXp(undone)).toBe(0);
  });
});

describe("levels", () => {
  it("has rising thresholds: 0, 100, 300, 600, 1000", () => {
    expect([1, 2, 3, 4, 5].map(levelThreshold)).toEqual([0, 100, 300, 600, 1000]);
  });

  it("puts the boundary XP in the higher level", () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(99)).toBe(1);
    expect(levelFor(100)).toBe(2);
    expect(levelFor(299)).toBe(2);
    expect(levelFor(300)).toBe(3);
    expect(levelFor(1000)).toBe(5);
  });

  it("is monotonic and tolerates nonsense", () => {
    let last = 1;
    for (let xp = 0; xp <= 5000; xp += 7) {
      const level = levelFor(xp);
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
    expect(levelFor(-50)).toBe(1);
    expect(levelThreshold(0)).toBe(0);
    expect(levelThreshold(-3)).toBe(0);
  });
});

describe("labStats", () => {
  it("totals XP across topics and reports progress toward the next level", () => {
    const topics = [topic("a"), topic("b")];
    const resources = [
      resource("1", "a", "youtube", true), // 50
      resource("2", "a", "youtube", true), // 50, topic a complete: +100
      resource("3", "b", "article", true), // 30
      resource("4", "b", "podcast", false),
    ];
    const stats = labStats(topics, resources);
    expect(stats.xp).toBe(50 + 50 + 100 + 30);
    expect(stats.level).toBe(levelFor(230));
    expect(stats.xpIntoLevel).toBe(230 - levelThreshold(stats.level));
    expect(stats.levelFraction).toBeCloseTo(stats.xpIntoLevel / stats.xpForNext);
    expect(stats.completedTopics).toBe(1);
    expect(stats.totalTopics).toBe(2);
    expect(stats.completedResources).toBe(3);
    expect(stats.totalResources).toBe(4);
  });

  it("ignores resources whose topic no longer exists", () => {
    const stats = labStats([topic("a")], [resource("1", "gone", "youtube", true)]);
    expect(stats.xp).toBe(0);
    expect(stats.totalResources).toBe(0);
  });

  it("starts everyone at level 1 with an empty bar", () => {
    const stats = labStats([], []);
    expect(stats).toMatchObject({ xp: 0, level: 1, xpIntoLevel: 0, levelFraction: 0, totalTopics: 0 });
  });
});

describe("celebrationFor", () => {
  it("scales the reaction: a chime, then fireworks, then a level", () => {
    expect(celebrationFor({ topicWasComplete: false, topicIsComplete: false, xpBefore: 0, xpAfter: 50 })).toBe("milestone");
    expect(celebrationFor({ topicWasComplete: false, topicIsComplete: true, xpBefore: 10, xpAfter: 60 })).toBe("topic");
    expect(celebrationFor({ topicWasComplete: false, topicIsComplete: true, xpBefore: 60, xpAfter: 160 })).toBe("level");
  });

  it("ranks a level-up above a topic completion", () => {
    expect(celebrationFor({ topicWasComplete: false, topicIsComplete: true, xpBefore: 90, xpAfter: 190 })).toBe("level");
  });

  it("never celebrates un-ticking, or standing still", () => {
    expect(celebrationFor({ topicWasComplete: true, topicIsComplete: false, xpBefore: 200, xpAfter: 100 })).toBe("none");
    expect(celebrationFor({ topicWasComplete: false, topicIsComplete: false, xpBefore: 50, xpAfter: 50 })).toBe("none");
  });

  it("does not re-celebrate a topic that was already complete", () => {
    expect(celebrationFor({ topicWasComplete: true, topicIsComplete: true, xpBefore: 250, xpAfter: 260 })).toBe("milestone");
  });
});
