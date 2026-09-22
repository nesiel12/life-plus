import { describe, expect, it } from "vitest";
import { gradeQuiz, isAnswerCorrect, scoreLabel, type GeneratedQuestion } from "@/lib/learning/quiz";

describe("isAnswerCorrect — mcq", () => {
  it("matches the correct option exactly, ignoring case/niqqud/punctuation", () => {
    expect(isAnswerCorrect("mcq", "פריז", "פריז")).toBe(true);
    expect(isAnswerCorrect("mcq", "פָּרִיז", "פריז!")).toBe(true);
    expect(isAnswerCorrect("mcq", "Paris", "paris")).toBe(true);
  });

  it("rejects a different option, or a substring of it", () => {
    expect(isAnswerCorrect("mcq", "פריז", "לונדון")).toBe(false);
    expect(isAnswerCorrect("mcq", "פריז", "רי")).toBe(false);
  });

  it("never marks an empty answer correct", () => {
    expect(isAnswerCorrect("mcq", "פריז", "")).toBe(false);
    expect(isAnswerCorrect("mcq", "פריז", "   ")).toBe(false);
  });
});

describe("isAnswerCorrect — short answer", () => {
  it("accepts an answer that contains the reference's key words, in any order/phrasing", () => {
    expect(isAnswerCorrect("short", "פריז", "זו פריז")).toBe(true);
    expect(isAnswerCorrect("short", "מלאכת בורר", "אני חושב שזו מלאכת בורר")).toBe(true);
    expect(isAnswerCorrect("short", "אור וחום", "חום ואור")).toBe(true);
  });

  it("rejects an answer missing a key word", () => {
    expect(isAnswerCorrect("short", "אור וחום", "רק אור")).toBe(false);
    expect(isAnswerCorrect("short", "פריז", "לונדון")).toBe(false);
  });

  it("rejects a blank answer even against a short reference", () => {
    expect(isAnswerCorrect("short", "כן", "")).toBe(false);
  });

  it("degrades to exact match when the reference has no real words to check", () => {
    expect(isAnswerCorrect("short", "1", "1")).toBe(true);
    expect(isAnswerCorrect("short", "1", "2")).toBe(false);
  });
});

describe("gradeQuiz", () => {
  const questions: GeneratedQuestion[] = [
    { prompt: "בירת צרפת?", kind: "mcq", options: ["לונדון", "פריז", "רומא"], correctAnswer: "פריז" },
    { prompt: "מה מלאכת בורר?", kind: "short", correctAnswer: "אוכל מתוך פסולת" },
    { prompt: "בירת איטליה?", kind: "mcq", options: ["מדריד", "רומא"], correctAnswer: "רומא" },
  ];

  it("grades each question independently and totals the score", () => {
    const result = gradeQuiz(questions, ["פריז", "משהו לא קשור", "רומא"]);
    expect(result.score).toBe(2);
    expect(result.total).toBe(3);
    expect(result.fraction).toBeCloseTo(2 / 3);
    expect(result.records.map((r) => r.correct)).toEqual([true, false, true]);
  });

  it("records the full question, not just the verdict, for review", () => {
    const [record] = gradeQuiz(questions, ["פריז"]).records;
    expect(record).toEqual({
      prompt: "בירת צרפת?",
      kind: "mcq",
      options: ["לונדון", "פריז", "רומא"],
      correctAnswer: "פריז",
      userAnswer: "פריז",
      correct: true,
    });
  });

  it("treats a missing answer as blank rather than throwing", () => {
    const result = gradeQuiz(questions, ["פריז"]);
    expect(result.total).toBe(3);
    expect(result.records[1].userAnswer).toBe("");
    expect(result.records[1].correct).toBe(false);
  });

  it("handles zero questions without dividing by zero", () => {
    expect(gradeQuiz([], [])).toEqual({ records: [], score: 0, total: 0, fraction: 0 });
  });

  it("trims whitespace from a typed answer before grading and storing it", () => {
    const result = gradeQuiz([questions[0]], ["  פריז  "]);
    expect(result.records[0].userAnswer).toBe("פריז");
    expect(result.records[0].correct).toBe(true);
  });
});

describe("scoreLabel", () => {
  it("formats as score/total", () => {
    expect(scoreLabel(3, 5)).toBe("3/5");
    expect(scoreLabel(0, 5)).toBe("0/5");
  });
});
