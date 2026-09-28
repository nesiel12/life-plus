import { describe, expect, it } from "vitest";
import { computeDailyMomentum, momentumTier, PRIORITY_WEIGHT } from "@/lib/gamification/momentum";
import type { TaskPriority } from "@/types";

function task(priority: TaskPriority, isCompleted: boolean) {
  return { priority, isCompleted };
}
function habit(isCompleted: boolean) {
  return { isCompleted };
}

describe("computeDailyMomentum", () => {
  it("scores 0 with nothing scheduled", () => {
    const result = computeDailyMomentum([], []);
    expect(result.score).toBe(0);
    expect(result.pointsPossible).toBe(0);
  });

  it("scores 100 when everything is completed", () => {
    const result = computeDailyMomentum([task("P3", true), task("P1", true)], [habit(true)]);
    expect(result.score).toBe(100);
    expect(result.tasksCompleted).toBe(2);
    expect(result.habitsCompleted).toBe(1);
  });

  it("scores 0 when nothing is completed", () => {
    const result = computeDailyMomentum([task("P3", false), task("P1", false)], [habit(false)]);
    expect(result.score).toBe(0);
  });

  it("weighs a P1 task more than a plain P3 one", () => {
    // One plain task done, one P1 task not done: 1 of 3 possible points.
    const result = computeDailyMomentum([task("P3", true), task("P1", false)], []);
    expect(result.pointsPossible).toBe(3);
    expect(result.pointsEarned).toBe(1);
    expect(result.score).toBe(33);
  });

  it("weighs P2 between P1 and P3", () => {
    const result = computeDailyMomentum([task("P2", true)], []);
    expect(result.pointsPossible).toBe(PRIORITY_WEIGHT.P2);
    expect(result.pointsEarned).toBe(PRIORITY_WEIGHT.P2);
    expect(result.score).toBe(100);
  });

  it("counts habits toward the score alongside tasks", () => {
    const result = computeDailyMomentum([task("P3", false)], [habit(true)]);
    // 1.5 of 2.5 possible points => 60%.
    expect(result.score).toBe(60);
  });

  it("never exceeds 100 or drops below 0", () => {
    const result = computeDailyMomentum([task("P3", true)], [habit(true)]);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("momentumTier", () => {
  it("buckets scores from idle to onFire", () => {
    expect(momentumTier(0)).toBe("idle");
    expect(momentumTier(20)).toBe("starting");
    expect(momentumTier(50)).toBe("building");
    expect(momentumTier(80)).toBe("strong");
    expect(momentumTier(95)).toBe("onFire");
  });
});
