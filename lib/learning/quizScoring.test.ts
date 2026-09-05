import { describe, expect, it } from "vitest";
import {
  isComplete,
  isSubmittable,
  scoreLabel,
  scoreQuiz,
  seededRandom,
  shuffle,
  shuffleQuiz,
} from "@/lib/learning/quizScoring";

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

describe("seededRandom", () => {
  it("is deterministic for a given seed", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("differs between seeds", () => {
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });

  it("stays within [0, 1)", () => {
    const r = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("keeps every element exactly once", () => {
    const out = shuffle([1, 2, 3, 4, 5], seededRandom(3));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3];
    shuffle(input, seededRandom(3));
    expect(input).toEqual([1, 2, 3]);
  });

  it("handles empty and single-element arrays", () => {
    expect(shuffle([], seededRandom(1))).toEqual([]);
    expect(shuffle([9], seededRandom(1))).toEqual([9]);
  });
});

describe("shuffleQuiz", () => {
  const quiz = [
    { question: "q1", options: ["a", "b", "c", "d"], correctIndex: 0, explanation: "e1" },
    { question: "q2", options: ["w", "x", "y", "z"], correctIndex: 3, explanation: "e2" },
    { question: "q3", options: ["p", "q", "r", "s"], correctIndex: 1, explanation: "e3" },
  ];

  // The property that actually matters: shuffling options without remapping
  // correctIndex would silently mark the wrong answer correct.
  it("keeps correctIndex pointing at the same option text", () => {
    for (let seed = 0; seed < 50; seed++) {
      const shuffled = shuffleQuiz(quiz, seed);
      for (const q of shuffled) {
        const original = quiz.find((o) => o.question === q.question)!;
        expect(q.options[q.correctIndex]).toBe(original.options[original.correctIndex]);
      }
    }
  });

  it("preserves every question and every option", () => {
    const shuffled = shuffleQuiz(quiz, 5);
    expect(shuffled).toHaveLength(3);
    expect(shuffled.map((q) => q.question).sort()).toEqual(["q1", "q2", "q3"]);
    for (const q of shuffled) {
      const original = quiz.find((o) => o.question === q.question)!;
      expect([...q.options].sort()).toEqual([...original.options].sort());
    }
  });

  it("is stable for the same seed, so a re-render does not move options", () => {
    expect(shuffleQuiz(quiz, 11)).toEqual(shuffleQuiz(quiz, 11));
  });

  it("actually reorders across seeds rather than returning the input", () => {
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => shuffleQuiz(quiz, seed).map((q) => q.question).join(","))
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("also varies option order, not just question order", () => {
    const orders = new Set(
      Array.from({ length: 30 }, (_, seed) => shuffleQuiz(quiz, seed)[0].options.join(","))
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not mutate the original quiz", () => {
    const snapshot = JSON.parse(JSON.stringify(quiz));
    shuffleQuiz(quiz, 9);
    expect(quiz).toEqual(snapshot);
  });

  it("handles an empty quiz", () => {
    expect(shuffleQuiz([], 1)).toEqual([]);
  });

  // Options can legitimately share text; index tagging (not text matching)
  // is what keeps correctIndex right in that case.
  it("stays correct when two options have identical text", () => {
    const dupes = [{ question: "q", options: ["same", "same", "b", "c"], correctIndex: 1, explanation: "e" }];
    for (let seed = 0; seed < 20; seed++) {
      const [q] = shuffleQuiz(dupes, seed);
      expect(q.correctIndex).toBeGreaterThanOrEqual(0);
      expect(q.options[q.correctIndex]).toBe("same");
    }
  });
});

// ── Flag / skip ───────────────────────────────────────────────────────────
//
// The flag exists so one unanswerable question cannot dead-end a course.

describe("flagging", () => {
  const questions = [{ correctIndex: 0 }, { correctIndex: 1 }, { correctIndex: 2 }];

  describe("isSubmittable", () => {
    it("is false when a question is neither answered nor flagged", () => {
      expect(isSubmittable(questions, [0, null, null], [false, true, false])).toBe(false);
    });

    it("is true when every question is answered", () => {
      expect(isSubmittable(questions, [0, 1, 2])).toBe(true);
    });

    it("is true when the gaps are all flagged", () => {
      expect(isSubmittable(questions, [0, null, null], [false, true, true])).toBe(true);
    });

    it("is true when every question is flagged and none answered", () => {
      expect(isSubmittable(questions, [null, null, null], [true, true, true])).toBe(true);
    });

    it("is false for an empty quiz", () => {
      expect(isSubmittable([], [], [])).toBe(false);
    });

    it("treats a missing flags array as no flags", () => {
      expect(isSubmittable(questions, [0, null, 2])).toBe(false);
    });

    // isComplete keeps its stricter meaning — it is not the submit gate.
    it("is looser than isComplete", () => {
      const answers = [0, null, 2];
      const flags = [false, true, false];
      expect(isComplete(questions, answers)).toBe(false);
      expect(isSubmittable(questions, answers, flags)).toBe(true);
    });
  });

  describe("scoreQuiz with flags", () => {
    it("counts a flagged, unanswered question as skipped", () => {
      const score = scoreQuiz(questions, [0, null, 2], [false, true, false]);
      expect(score.skipped).toBe(1);
      expect(score.answered).toBe(2);
    });

    // Flagging must not be a way to a perfect overall score.
    it("still counts a skipped question against the overall percent", () => {
      const score = scoreQuiz(questions, [0, null, 2], [false, true, false]);
      expect(score.correct).toBe(2);
      expect(score.percent).toBe(67);
    });

    it("reports a separate percentage over what was attempted", () => {
      const score = scoreQuiz(questions, [0, null, 2], [false, true, false]);
      expect(score.attemptedPercent).toBe(100);
    });

    it("grades an answered question even if it is also flagged", () => {
      const score = scoreQuiz(questions, [0, 1, 2], [false, true, false]);
      expect(score.answered).toBe(3);
      expect(score.skipped).toBe(0);
      expect(score.correct).toBe(3);
    });

    it("does not count an unanswered, unflagged question as skipped", () => {
      const score = scoreQuiz(questions, [0, null, 2]);
      expect(score.skipped).toBe(0);
      expect(score.answered).toBe(2);
    });

    it("does not divide by zero when everything is flagged", () => {
      const score = scoreQuiz(questions, [null, null, null], [true, true, true]);
      expect(score.attemptedPercent).toBe(0);
      expect(score.percent).toBe(0);
      expect(score.skipped).toBe(3);
    });

    it("is unchanged when no flags are passed at all", () => {
      const withOut = scoreQuiz(questions, [0, 1, 2]);
      expect(withOut).toMatchObject({ correct: 3, percent: 100, skipped: 0, attemptedPercent: 100 });
    });
  });
});
