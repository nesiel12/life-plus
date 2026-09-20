import { describe, expect, it } from "vitest";
import { nextDifficulty, pickQuestion, readyForChallenge, startingDifficulty } from "@/lib/torah/adaptive";

describe("the difficulty staircase", () => {
  it("steps up after a strong answer and down after a weak one", () => {
    expect(nextDifficulty(3, 90)).toBe(4);
    expect(nextDifficulty(3, 40)).toBe(2);
    expect(nextDifficulty(3, 70)).toBe(3);
  });

  it("stays inside 1..5 and ignores an ungraded answer", () => {
    expect(nextDifficulty(5, 100)).toBe(5);
    expect(nextDifficulty(1, 0)).toBe(1);
    expect(nextDifficulty(9, null)).toBe(5);
  });

  it("starts from recent performance", () => {
    expect(startingDifficulty([])).toBe(2);
    expect(startingDifficulty([90, 88, 95])).toBe(4);
    expect(startingDifficulty([30, 40])).toBe(1);
    expect(startingDifficulty([10, 10, 10, 10, 10, 80, 80, 80, 80, 80])).toBe(3);
  });
});

describe("pickQuestion", () => {
  const questions = [
    { id: "a", difficulty: 1 },
    { id: "b", difficulty: 3 },
    { id: "c", difficulty: 4 },
    { id: "d", difficulty: 5 },
  ];

  it("picks the closest level, preferring harder on a tie", () => {
    expect(pickQuestion(questions, new Set(), 3)?.id).toBe("b");
    expect(pickQuestion(questions, new Set(["b"]), 3.5)?.id).toBe("c");
    expect(pickQuestion(questions, new Set(["b"]), 3)?.id).toBe("c");
  });

  it("skips answered questions and returns null when none remain", () => {
    expect(pickQuestion(questions, new Set(["a", "b", "c", "d"]), 3)).toBeNull();
  });
});

describe("readyForChallenge", () => {
  it("needs at least two graded answers averaging 80+", () => {
    expect(readyForChallenge([95])).toBe(false);
    expect(readyForChallenge([85, 80, null])).toBe(true);
    expect(readyForChallenge([85, 60])).toBe(false);
  });
});
