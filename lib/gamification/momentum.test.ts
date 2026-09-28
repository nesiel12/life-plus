import { describe, expect, it } from "vitest";
import { computeDailyMomentum, momentumTier } from "@/lib/gamification/momentum";

function task(isHighPriority: boolean, isCompleted: boolean) {
  return { isHighPriority, isCompleted };
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
    const result = computeDailyMomentum([task(false, true), task(true, true)], [habit(true)]);
    expect(result.score).toBe(100);
    expect(result.tasksCompleted).toBe(2);
    expect(result.habitsCompleted).toBe(1);
  });

  it("scores 0 when nothing is completed", () => {
    const result = computeDailyMomentum([task(false, false), task(true, false)], [habit(false)]);
    expect(result.score).toBe(0);
  });

  it("weighs a high-priority task more than a plain one", () => {
    // One plain task done, one high-priority task not done: 1 of 3 possible points.
    const result = computeDailyMomentum([task(false, true), task(true, false)], []);
    expect(result.pointsPossible).toBe(3);
    expect(result.pointsEarned).toBe(1);
    expect(result.score).toBe(33);
  });

  it("counts habits toward the score alongside tasks", () => {
    const result = computeDailyMomentum([task(false, false)], [habit(true)]);
    // 1.5 of 2.5 possible points => 60%.
    expect(result.score).toBe(60);
  });

  it("never exceeds 100 or drops below 0", () => {
    const result = computeDailyMomentum([task(false, true)], [habit(true)]);
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
