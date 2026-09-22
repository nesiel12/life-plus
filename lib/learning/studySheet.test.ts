import { describe, expect, it } from "vitest";
import { buildStudySheet } from "@/lib/learning/studySheet";
import { computeMastery } from "@/lib/learning/mastery";
import type { LearningQuote, LearningResource, LearningTopic } from "@/types";

const topic: LearningTopic = { id: "t1", title: "פיזיקה קוונטית", category: "מדעים", status: "active", createdAt: "2026-09-01T00:00:00Z" };
const res = (id: string, type: LearningResource["type"], isCompleted: boolean): LearningResource => ({
  id,
  topicId: "t1",
  type,
  title: `שלב ${id}`,
  isCompleted,
  createdAt: "2026-09-01T00:00:00Z",
});
const quote = (id: string, text: string, bookTitle: string): LearningQuote & { bookTitle: string } => ({
  id,
  bookId: "b1",
  text,
  createdAt: "2026-09-01T00:00:00Z",
  bookTitle,
});

describe("buildStudySheet", () => {
  it("carries the topic's title, category and step list with Hebrew type labels", () => {
    const resources = [res("1", "youtube", true), res("2", "article", false)];
    const mastery = computeMastery({ resources, quizFractions: [], flashcards: [] });
    const sheet = buildStudySheet({ topic, resources, quotes: [], mastery });
    expect(sheet.topicTitle).toBe("פיזיקה קוונטית");
    expect(sheet.category).toBe("מדעים");
    expect(sheet.steps).toEqual([
      { title: "שלב 1", done: true, typeLabel: "סרטון" },
      { title: "שלב 2", done: false, typeLabel: "מאמר" },
    ]);
    expect(sheet.doneCount).toBe(1);
    expect(sheet.totalCount).toBe(2);
  });

  it("carries the mastery score and its Hebrew label", () => {
    const resources = [res("1", "article", true)];
    const mastery = computeMastery({ resources, quizFractions: [], flashcards: [] });
    const sheet = buildStudySheet({ topic, resources, quotes: [], mastery });
    expect(sheet.mastery.score).toBe(mastery.score);
    expect(sheet.mastery.label).toBeTruthy();
  });

  it("includes quotes with their source book", () => {
    const mastery = computeMastery({ resources: [], quizFractions: [], flashcards: [] });
    const sheet = buildStudySheet({
      topic,
      resources: [],
      quotes: [quote("q1", "המדע הוא דרך חשיבה.", "קוסמוס")],
      mastery,
    });
    expect(sheet.quotes).toEqual([{ text: "המדע הוא דרך חשיבה.", chapterLabel: undefined, bookTitle: "קוסמוס" }]);
  });

  it("clips an overly long quote", () => {
    const mastery = computeMastery({ resources: [], quizFractions: [], flashcards: [] });
    const longText = "משפט אחד ארוך. " + "מילים ".repeat(200) + "סוף.";
    const sheet = buildStudySheet({ topic, resources: [], quotes: [quote("q1", longText, "ספר")], mastery });
    expect(sheet.quotes[0].text.length).toBeLessThan(longText.length);
  });

  it("caps steps and quotes so the sheet stays printable", () => {
    const resources = Array.from({ length: 20 }, (_, i) => res(String(i), "article", false));
    const quotes = Array.from({ length: 10 }, (_, i) => quote(String(i), `ציטוט ${i}`, "ספר"));
    const mastery = computeMastery({ resources, quizFractions: [], flashcards: [] });
    const sheet = buildStudySheet({ topic, resources, quotes, mastery });
    expect(sheet.steps.length).toBeLessThan(20);
    expect(sheet.quotes.length).toBeLessThan(10);
  });

  it("is empty only when there are neither steps nor quotes", () => {
    const mastery = computeMastery({ resources: [], quizFractions: [], flashcards: [] });
    expect(buildStudySheet({ topic, resources: [], quotes: [], mastery }).isEmpty).toBe(true);
    expect(buildStudySheet({ topic, resources: [res("1", "article", false)], quotes: [], mastery }).isEmpty).toBe(false);
  });
});
