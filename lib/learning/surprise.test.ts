import { describe, expect, it } from "vitest";
import { buildRoll, pickSurpriseTopic, seededRng } from "@/lib/learning/surprise";
import type { LearningResource, LearningTopic } from "@/types";

const topic = (id: string): LearningTopic => ({ id, title: id, status: "active", createdAt: "2026-09-01T00:00:00Z" });
const res = (id: string, topicId: string, isCompleted: boolean): LearningResource => ({
  id, topicId, type: "youtube", title: id, isCompleted, createdAt: "2026-09-01T00:00:00Z",
});

describe("seededRng", () => {
  it("is deterministic and stays in [0, 1)", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    for (let i = 0; i < 200; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(seededRng(1)()).not.toBe(seededRng(2)());
  });
});

describe("pickSurpriseTopic", () => {
  it("has nothing to pick from an empty lab", () => {
    expect(pickSurpriseTopic([], [], seededRng(1))).toBeNull();
  });

  it("returns the only topic there is", () => {
    expect(pickSurpriseTopic([topic("only")], [], seededRng(1))).toBe("only");
  });

  it("always returns a real topic id", () => {
    const topics = ["a", "b", "c", "d"].map(topic);
    const rng = seededRng(7);
    for (let i = 0; i < 300; i++) expect(topics.map((t) => t.id)).toContain(pickSurpriseTopic(topics, [], rng));
  });

  it("leans toward half-finished topics and away from finished ones", () => {
    const topics = ["started", "fresh", "done"].map(topic);
    const resources = [
      res("s1", "started", true), res("s2", "started", false),
      res("f1", "fresh", false),
      res("d1", "done", true), res("d2", "done", true),
    ];
    const counts: Record<string, number> = { started: 0, fresh: 0, done: 0 };
    const rng = seededRng(2026);
    for (let i = 0; i < 4000; i++) counts[pickSurpriseTopic(topics, resources, rng)!]++;
    expect(counts.started).toBeGreaterThan(counts.fresh);
    expect(counts.fresh).toBeGreaterThan(counts.done);
    // A finished topic is rare, not impossible.
    expect(counts.done).toBeGreaterThan(0);
  });

  it("is reproducible for a given seed", () => {
    const topics = ["a", "b", "c", "d", "e"].map(topic);
    expect(pickSurpriseTopic(topics, [], seededRng(99))).toBe(pickSurpriseTopic(topics, [], seededRng(99)));
  });
});

describe("buildRoll", () => {
  it("has nothing to roll over with no cards", () => {
    expect(buildRoll(0, 0, seededRng(1))).toEqual([]);
  });

  it("just lands when there is one card", () => {
    const roll = buildRoll(1, 0, seededRng(1));
    expect(roll).toHaveLength(1);
    expect(roll[0].index).toBe(0);
  });

  it("always ends exactly on the target, wherever it starts", () => {
    for (let count = 2; count <= 40; count++) {
      for (let target = 0; target < count; target += Math.max(1, Math.floor(count / 5))) {
        for (const seed of [1, 2, 3, 4, 5]) {
          const roll = buildRoll(count, target, seededRng(seed * 31 + count));
          expect(roll[roll.length - 1].index, `count ${count}, target ${target}, seed ${seed}`).toBe(target);
        }
      }
    }
  });

  it("advances one card at a time, wrapping around", () => {
    const roll = buildRoll(6, 2, seededRng(3));
    for (let i = 1; i < roll.length; i++) expect(roll[i].index).toBe((roll[i - 1].index + 1) % 6);
  });

  it("is long enough to read as a roll, even over few cards", () => {
    for (let count = 2; count <= 10; count++) expect(buildRoll(count, 0, seededRng(count)).length).toBeGreaterThanOrEqual(14);
  });

  it("slows down like a reel: delays never shrink, and end slower than they began", () => {
    const roll = buildRoll(8, 5, seededRng(11));
    for (let i = 1; i < roll.length; i++) expect(roll[i].delayMs).toBeGreaterThanOrEqual(roll[i - 1].delayMs);
    expect(roll[roll.length - 1].delayMs).toBeGreaterThan(roll[0].delayMs * 3);
    expect(roll[0].delayMs).toBeGreaterThanOrEqual(30);
  });

  it("stays within the total time it should take", () => {
    const total = buildRoll(8, 5, seededRng(11)).reduce((sum, s) => sum + s.delayMs, 0);
    expect(total).toBeGreaterThan(1500);
    expect(total).toBeLessThan(8000);
  });

  it("clamps a target that is out of range", () => {
    expect(buildRoll(5, 99, seededRng(1)).at(-1)!.index).toBe(4);
    expect(buildRoll(5, -3, seededRng(1)).at(-1)!.index).toBe(0);
  });
});
