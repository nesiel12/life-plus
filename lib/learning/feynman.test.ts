import { describe, expect, it } from "vitest";
import { CLARITY_BAND_LABELS, buildFeynmanPrompt, clarityBand } from "@/lib/learning/feynman";

describe("buildFeynmanPrompt", () => {
  it("includes the topic, the concept, and the explanation verbatim", () => {
    const prompt = buildFeynmanPrompt({ topicTitle: "פיזיקה קוונטית", concept: "עיקרון אי-הוודאות", explanation: "אי אפשר לדעת גם מיקום וגם מהירות בדיוק מוחלט" });
    expect(prompt).toContain("פיזיקה קוונטית");
    expect(prompt).toContain("עיקרון אי-הוודאות");
    expect(prompt).toContain("אי אפשר לדעת גם מיקום וגם מהירות");
  });

  it("caps an absurdly long explanation rather than sending it whole", () => {
    const huge = "א".repeat(10_000);
    const prompt = buildFeynmanPrompt({ topicTitle: "x", concept: "y", explanation: huge });
    expect(prompt.length).toBeLessThan(huge.length);
  });

  it("trims surrounding whitespace", () => {
    const prompt = buildFeynmanPrompt({ topicTitle: "x", concept: "y", explanation: "   כן   " });
    expect(prompt).toContain("כן");
    expect(prompt.includes("   כן   ")).toBe(false);
  });
});

describe("clarityBand", () => {
  it("buckets the score", () => {
    expect(clarityBand(10)).toBe("unclear");
    expect(clarityBand(50)).toBe("partial");
    expect(clarityBand(75)).toBe("clear");
    expect(clarityBand(95)).toBe("excellent");
  });

  it("has a label for every band", () => {
    for (const score of [10, 50, 75, 95]) {
      expect(CLARITY_BAND_LABELS[clarityBand(score)]).toBeTruthy();
    }
  });
});
