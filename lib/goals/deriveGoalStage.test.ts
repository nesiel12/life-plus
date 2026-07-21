import { describe, expect, it } from "vitest";
import { deriveGoalStage } from "@/lib/goals/deriveGoalStage";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();

describe("deriveGoalStage", () => {
  it('returns "starting" for a goal with no milestones at all', () => {
    expect(
      deriveGoalStage({ createdAt: "2026-07-19T00:00:00Z", completedMilestones: 0, totalMilestones: 0 }, NOW)
    ).toBe("starting");
  });

  it('returns "completed" once every milestone is done', () => {
    expect(
      deriveGoalStage({ createdAt: "2026-06-01T00:00:00Z", completedMilestones: 4, totalMilestones: 4 }, NOW)
    ).toBe("completed");
  });

  it('returns "starting" for a recent goal with nothing done yet', () => {
    expect(
      deriveGoalStage({ createdAt: "2026-07-19T00:00:00Z", completedMilestones: 0, totalMilestones: 4 }, NOW)
    ).toBe("starting");
  });

  it('returns "stuck" once an untouched goal crosses the stagnation threshold', () => {
    expect(
      deriveGoalStage({ createdAt: "2026-06-01T00:00:00Z", completedMilestones: 0, totalMilestones: 4 }, NOW)
    ).toBe("stuck");
  });

  it('returns "in_progress" once at least one milestone is done, regardless of age', () => {
    expect(
      deriveGoalStage({ createdAt: "2026-06-01T00:00:00Z", completedMilestones: 1, totalMilestones: 4 }, NOW)
    ).toBe("in_progress");
  });
});
