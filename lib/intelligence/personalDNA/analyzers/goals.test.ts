import { describe, expect, it } from "vitest";
import { analyzeGoalPatterns } from "@/lib/intelligence/personalDNA/analyzers/goals";

const NOW = new Date("2026-07-20T12:00:00Z").getTime();

describe("analyzeGoalPatterns — taskSizePreference", () => {
  it("produces nothing with too few goals", () => {
    const goals = [
      { createdAt: "2026-06-01", milestoneCount: 2, doneCount: 2 },
      { createdAt: "2026-06-01", milestoneCount: 6, doneCount: 1 },
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    expect(result.find((p) => p.patternType === "taskSizePreference")).toBeUndefined();
  });

  it("detects a preference for small tasks when small-goal completion rate is clearly higher", () => {
    const goals = [
      { createdAt: "2026-06-01", milestoneCount: 2, doneCount: 2 }, // 100%
      { createdAt: "2026-06-01", milestoneCount: 3, doneCount: 3 }, // 100%
      { createdAt: "2026-06-01", milestoneCount: 8, doneCount: 1 }, // 12.5%
      { createdAt: "2026-06-01", milestoneCount: 10, doneCount: 0 }, // 0%
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    const pattern = result.find((p) => p.patternType === "taskSizePreference");
    expect(pattern?.value).toBe("smallTasks");
  });

  it("detects a preference for large tasks when the difference runs the other way", () => {
    const goals = [
      { createdAt: "2026-06-01", milestoneCount: 2, doneCount: 0 },
      { createdAt: "2026-06-01", milestoneCount: 3, doneCount: 0 },
      { createdAt: "2026-06-01", milestoneCount: 8, doneCount: 8 },
      { createdAt: "2026-06-01", milestoneCount: 10, doneCount: 9 },
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    const pattern = result.find((p) => p.patternType === "taskSizePreference");
    expect(pattern?.value).toBe("largeTasks");
  });

  it("produces nothing when completion rates are similar regardless of size", () => {
    const goals = [
      { createdAt: "2026-06-01", milestoneCount: 2, doneCount: 1 },
      { createdAt: "2026-06-01", milestoneCount: 3, doneCount: 2 },
      { createdAt: "2026-06-01", milestoneCount: 8, doneCount: 4 },
      { createdAt: "2026-06-01", milestoneCount: 10, doneCount: 5 },
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    expect(result.find((p) => p.patternType === "taskSizePreference")).toBeUndefined();
  });
});

describe("analyzeGoalPatterns — goalMomentum", () => {
  it("flags stagnation when most open goals haven't moved in over two weeks", () => {
    const goals = [
      { createdAt: "2026-06-01T00:00:00Z", milestoneCount: 4, doneCount: 0 }, // ~49 days old, untouched
      { createdAt: "2026-06-15T00:00:00Z", milestoneCount: 3, doneCount: 0 }, // ~35 days old, untouched
      { createdAt: "2026-07-19T00:00:00Z", milestoneCount: 2, doneCount: 1 }, // recent, in progress
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    const pattern = result.find((p) => p.patternType === "goalMomentum");
    expect(pattern?.value).toBe("stagnationRisk");
  });

  it("does not flag stagnation when goals are progressing", () => {
    const goals = [
      { createdAt: "2026-07-01T00:00:00Z", milestoneCount: 4, doneCount: 2 },
      { createdAt: "2026-07-10T00:00:00Z", milestoneCount: 3, doneCount: 1 },
    ];
    const result = analyzeGoalPatterns(goals, [], NOW);
    expect(result.find((p) => p.patternType === "goalMomentum")).toBeUndefined();
  });
});

describe("analyzeGoalPatterns — milestoneCompletionPace", () => {
  it("produces nothing with fewer than 3 completed milestones", () => {
    const completed = [
      { createdAt: "2026-07-01T00:00:00Z", completedAt: "2026-07-03T00:00:00Z" },
      { createdAt: "2026-07-01T00:00:00Z", completedAt: "2026-07-05T00:00:00Z" },
    ];
    const result = analyzeGoalPatterns([], completed, NOW);
    expect(result.find((p) => p.patternType === "milestoneCompletionPace")).toBeUndefined();
  });

  it("computes the average days-to-complete across completed milestones", () => {
    const completed = [
      { createdAt: "2026-07-01T00:00:00Z", completedAt: "2026-07-03T00:00:00Z" }, // 2 days
      { createdAt: "2026-07-01T00:00:00Z", completedAt: "2026-07-05T00:00:00Z" }, // 4 days
      { createdAt: "2026-07-01T00:00:00Z", completedAt: "2026-07-07T00:00:00Z" }, // 6 days
    ];
    const result = analyzeGoalPatterns([], completed, NOW);
    const pattern = result.find((p) => p.patternType === "milestoneCompletionPace");
    expect(pattern?.value).toBe("4.0");
  });
});
