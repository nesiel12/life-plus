import { describe, expect, it } from "vitest";
import { analyzeLearningPatterns } from "@/lib/intelligence/personalDNA/analyzers/learning";

describe("analyzeLearningPatterns — topic focus", () => {
  it("produces nothing below the minimum evidence threshold", () => {
    const entries = [
      { topic: "גמרא ברכות", source: "שיעור", date: "2026-07-01" },
      { topic: "גמרא שבת", source: "שיעור", date: "2026-07-08" },
    ];
    const result = analyzeLearningPatterns(entries);
    expect(result.find((p) => p.patternType === "learningTopicFocus")).toBeUndefined();
  });

  it("detects a recurring topic word across entries", () => {
    const entries = [
      { topic: "גמרא ברכות", source: "שיעור שבועי", date: "2026-07-01" },
      { topic: "גמרא שבת", source: "שיעור שבועי", date: "2026-07-08" },
      { topic: "הלכות תפילה", source: "ספר הלכה", date: "2026-07-15" },
    ];
    const result = analyzeLearningPatterns(entries);
    const topicPattern = result.find((p) => p.patternType === "learningTopicFocus");
    expect(topicPattern).toBeDefined();
    expect(topicPattern?.value).toBe("גמרא");
    expect(topicPattern?.evidenceCount).toBe(3);
  });

  it("does not report a topic where no word actually recurs", () => {
    const entries = [
      { topic: "ברכות", source: "עמוד", date: "2026-07-01" },
      { topic: "שבת", source: "פרק", date: "2026-07-08" },
      { topic: "תפילה", source: "ספר", date: "2026-07-15" },
    ];
    const result = analyzeLearningPatterns(entries);
    expect(result.find((p) => p.patternType === "learningTopicFocus")).toBeUndefined();
  });
});

describe("analyzeLearningPatterns — cadence", () => {
  it("produces nothing when the observed span is too short", () => {
    const entries = [
      { topic: "א", source: "א", date: "2026-07-01" },
      { topic: "ב", source: "ב", date: "2026-07-02" },
    ];
    const result = analyzeLearningPatterns(entries);
    expect(result.find((p) => p.patternType === "learningCadence")).toBeUndefined();
  });

  it("computes sessions-per-week over a long-enough span", () => {
    // 5 entries spanning exactly 30 days -> 5 / (30/7) = 1.1667.../week
    const entries = [
      { topic: "א", source: "א", date: "2026-07-01" },
      { topic: "ב", source: "ב", date: "2026-07-08" },
      { topic: "ג", source: "ג", date: "2026-07-15" },
      { topic: "ד", source: "ד", date: "2026-07-22" },
      { topic: "ה", source: "ה", date: "2026-07-31" },
    ];
    const result = analyzeLearningPatterns(entries);
    const cadence = result.find((p) => p.patternType === "learningCadence");
    expect(cadence).toBeDefined();
    expect(cadence?.value).toBe("1.2");
  });
});
