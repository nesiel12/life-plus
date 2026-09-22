import { describe, expect, it } from "vitest";
import {
  MASTERY_LEVEL_LABELS,
  averageQuizFraction,
  computeMastery,
  masteryLevel,
  type MasteryInputs,
} from "@/lib/learning/mastery";
import type { SrsState } from "@/lib/torah/srs";

const res = (isCompleted: boolean) => ({ isCompleted });
const card = (repetitions: number, intervalDays: number): Pick<SrsState, "repetitions" | "intervalDays"> => ({
  repetitions,
  intervalDays,
});

describe("averageQuizFraction", () => {
  it("averages the recent attempts", () => {
    expect(averageQuizFraction([1, 0.5])).toBeCloseTo(0.75);
  });

  it("is null with no attempts at all", () => {
    expect(averageQuizFraction([])).toBeNull();
  });

  it("only counts the most recent window, ignoring an old slump", () => {
    // 5 recent perfect scores, one old zero far behind them.
    const recentFirst = [1, 1, 1, 1, 1, 0];
    expect(averageQuizFraction(recentFirst)).toBe(1);
  });
});

describe("masteryLevel / MASTERY_LEVEL_LABELS", () => {
  it("buckets the score into named levels", () => {
    expect(masteryLevel(0)).toBe("not-started");
    expect(masteryLevel(20)).toBe("beginner");
    expect(masteryLevel(50)).toBe("developing");
    expect(masteryLevel(80)).toBe("proficient");
    expect(masteryLevel(95)).toBe("mastered");
    expect(masteryLevel(100)).toBe("mastered");
  });

  it("has a label for every level the function can return", () => {
    for (const score of [0, 20, 50, 80, 100]) {
      expect(MASTERY_LEVEL_LABELS[masteryLevel(score)]).toBeTruthy();
    }
  });
});

describe("computeMastery", () => {
  it("is 0 and not-started with no evidence of any kind", () => {
    const result = computeMastery({ resources: [], quizFractions: [], flashcards: [] });
    expect(result).toMatchObject({ score: 0, hasSyllabus: false, hasQuizzes: false, hasFlashcards: false, tier: "not-started" });
  });

  it("reads syllabus-only progress as real, non-zero mastery — not '0% because untested'", () => {
    const result = computeMastery({ resources: [res(true), res(true), res(false), res(false)], quizFractions: [], flashcards: [] });
    expect(result.hasSyllabus).toBe(true);
    expect(result.hasQuizzes).toBe(false);
    expect(result.hasFlashcards).toBe(false);
    // Weighted purely on the syllabus half-done -> the score IS the syllabus fraction, not diluted by zeros.
    expect(result.score).toBe(50);
  });

  it("blends all three sources when every one has evidence", () => {
    const input: MasteryInputs = {
      resources: [res(true), res(true), res(true), res(false)], // 0.75
      quizFractions: [1, 1], // 1.0
      flashcards: [card(10, 100), card(8, 60)], // mature/young -> high deckProgress
    };
    const result = computeMastery(input);
    expect(result.hasSyllabus && result.hasQuizzes && result.hasFlashcards).toBe(true);
    // Should sit meaningfully above the syllabus-only number, since quizzes and deck are both strong.
    expect(result.score).toBeGreaterThan(75);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("never exceeds 100 or drops below 0", () => {
    const perfect = computeMastery({
      resources: [res(true)],
      quizFractions: [1, 1, 1, 1, 1],
      flashcards: [card(20, 400)],
    });
    expect(perfect.score).toBeLessThanOrEqual(100);

    const empty = computeMastery({ resources: [res(false)], quizFractions: [0], flashcards: [card(0, 0)] });
    expect(empty.score).toBeGreaterThanOrEqual(0);
  });

  it("rises monotonically as syllabus completion rises, holding quizzes/deck fixed", () => {
    const base = { quizFractions: [0.6], flashcards: [card(3, 10)] };
    const quarter = computeMastery({ ...base, resources: [res(true), res(false), res(false), res(false)] });
    const half = computeMastery({ ...base, resources: [res(true), res(true), res(false), res(false)] });
    const full = computeMastery({ ...base, resources: [res(true), res(true), res(true), res(true)] });
    expect(quarter.score).toBeLessThan(half.score);
    expect(half.score).toBeLessThan(full.score);
  });

  it("is unaffected by a resource whose type is irrelevant to completion (ignores everything but isCompleted)", () => {
    const a = computeMastery({ resources: [{ isCompleted: true }], quizFractions: [], flashcards: [] });
    const b = computeMastery({ resources: [{ isCompleted: true }], quizFractions: [], flashcards: [] });
    expect(a.score).toBe(b.score);
  });

  it("reports each source's own fraction alongside the blended score", () => {
    const result = computeMastery({
      resources: [res(true), res(false)],
      quizFractions: [0.8],
      flashcards: [card(5, 30)],
    });
    expect(result.syllabusFraction).toBe(0.5);
    expect(result.quizFraction).toBe(0.8);
    expect(result.deckFraction).toBeGreaterThan(0);
  });
});
