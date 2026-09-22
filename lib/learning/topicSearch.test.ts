import { describe, expect, it } from "vitest";
import { filterTopics, normalizeText } from "@/lib/learning/topicSearch";

const topics = [
  { id: "1", title: "פייתון למתחילים", category: "תכנות" },
  { id: "2", title: "פיזיקה קוונטית", category: "מדעים" },
  { id: "3", title: "Machine Learning", category: "AI" },
];
const resources = [
  { topicId: "2", title: "מבוא לתורת הקוונטים - שיעור 1" },
  { topicId: "3", title: "Neural networks explained" },
];

describe("normalizeText", () => {
  it("strips niqqud and punctuation, and folds case", () => {
    expect(normalizeText("שָׁלוֹם, עוֹלָם!")).toBe("שלום עולם");
    expect(normalizeText("  Hello,   WORLD  ")).toBe("hello world");
  });
});

describe("filterTopics", () => {
  it("returns everything, in order, for an empty query", () => {
    expect(filterTopics(topics, resources, "").map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(filterTopics(topics, resources, "   ").map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("matches titles, categories and resource titles", () => {
    expect(filterTopics(topics, resources, "פייתון").map((t) => t.id)).toEqual(["1"]);
    expect(filterTopics(topics, resources, "מדעים").map((t) => t.id)).toEqual(["2"]);
    expect(filterTopics(topics, resources, "neural").map((t) => t.id)).toEqual(["3"]);
  });

  it("needs every word to match, in any order", () => {
    expect(filterTopics(topics, resources, "קוונטית פיזיקה").map((t) => t.id)).toEqual(["2"]);
    expect(filterTopics(topics, resources, "פיזיקה פייתון")).toEqual([]);
  });

  it("is case-insensitive and finds part of a word", () => {
    expect(filterTopics(topics, resources, "MACHINE").map((t) => t.id)).toEqual(["3"]);
    expect(filterTopics(topics, resources, "קוונט").map((t) => t.id)).toEqual(["2"]);
  });

  it("does not mutate what it is given", () => {
    const copy = JSON.stringify(topics);
    filterTopics(topics, resources, "פיזיקה");
    expect(JSON.stringify(topics)).toBe(copy);
  });
});
