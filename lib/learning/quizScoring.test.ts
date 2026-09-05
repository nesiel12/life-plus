import { describe, expect, it } from "vitest";
import { isComplete, scoreLabel, scoreQuiz } from "@/lib/learning/quizScoring";

const q = (correctIndex: number) => ({ correctIndex });
const THREE = [q(0), q(1), q(2)];

describe("scoreQuiz", () => {
  it("scores a perfect run", () => {
    const score = scoreQuiz(THREE, [0, 1, 2]);
    expect(score.correct).toBe(3);
    expect(score.percent).toBe(100);
    expect(score.allAnswered).toBe(true);
  });

  it("scores all wrong", () => {
    const score = scoreQuiz(THREE, [1, 2, 0]);
    expect(score.correct).toBe(0);
    expect(score.percent).toBe(0);
  });

  it("scores a partial run", () => {
    const score = scoreQuiz(THREE, [0, 1, 0]);
    expect(score.correct).toBe(2);
    expect(score.percent).toBe(67);
  });

  it("counts an unanswered question as wrong but not as answered", () => {
    const score = scoreQuiz(THREE, [0, null, null]);
    expect(score.correct).toBe(1);
    expect(score.answered).toBe(1);
    expect(score.allAnswered).toBe(false);
    // Percent is of the whole quiz, not of what was attempted — otherwise
    // answering one question correctly would read as 100%.
    expect(score.percent).toBe(33);
  });

  it("treats a sparse answers array the same as explicit nulls", () => {
    const score = scoreQuiz(THREE, [0]);
    expect(score.correct).toBe(1);
    expect(score.answered).toBe(1);
    expect(score.allAnswered).toBe(false);
  });

  it("does not divide by zero on an empty quiz", () => {
    const score = scoreQuiz([], []);
    expect(score.percent).toBe(0);
    expect(score.total).toBe(0);
    expect(score.allAnswered).toBe(false);
  });

  it("selecting index 0 counts as a real answer, not as missing", () => {
    // The classic falsy-zero bug: 0 is a valid option index.
    const score = scoreQuiz([q(0)], [0]);
    expect(score.answered).toBe(1);
    expect(score.correct).toBe(1);
  });
});

describe("scoreLabel", () => {
  it("names each band at its boundary", () => {
    expect(scoreLabel(100)).toBe("שליטה מצוינת");
    expect(scoreLabel(90)).toBe("שליטה מצוינת");
    expect(scoreLabel(89)).toBe("הבנה טובה");
    expect(scoreLabel(70)).toBe("הבנה טובה");
    expect(scoreLabel(69)).toBe("כמעט שם");
    expect(scoreLabel(50)).toBe("כמעט שם");
    expect(scoreLabel(49)).toBe("כדאי לחזור על החומר");
    expect(scoreLabel(0)).toBe("כדאי לחזור על החומר");
  });

  it("does not call a failing score encouraging", () => {
    expect(scoreLabel(40)).toBe("כדאי לחזור על החומר");
  });
});

describe("isComplete", () => {
  it("is true only when every question has a selection", () => {
    expect(isComplete(THREE, [0, 1, 2])).toBe(true);
    expect(isComplete(THREE, [0, 1, null])).toBe(false);
    expect(isComplete(THREE, [0])).toBe(false);
  });

  it("counts a zero selection as answered", () => {
    expect(isComplete([q(1)], [0])).toBe(true);
  });

  it("is false for an empty quiz — there is nothing to submit", () => {
    expect(isComplete([], [])).toBe(false);
  });
});
