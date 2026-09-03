import { describe, expect, it } from "vitest";
import {
  applyMasteryDelta,
  masteryLabel,
  MAX_TRANSCRIPT_CHARS,
  truncateTranscript,
} from "@/lib/ai/agents/studyAgent";

describe("truncateTranscript", () => {
  it("leaves a short transcript untouched apart from trimming", () => {
    expect(truncateTranscript("  שלום עולם  ")).toBe("שלום עולם");
  });

  it("keeps head and tail when over the cap", () => {
    const head = "A".repeat(10_000);
    const tail = "B".repeat(10_000);
    const result = truncateTranscript(head + tail);
    expect(result.length).toBeLessThan(head.length + tail.length);
    expect(result.startsWith("A")).toBe(true);
    expect(result.endsWith("B")).toBe(true);
    expect(result).toContain("הושמט");
  });

  it("keeps a transcript exactly at the cap intact", () => {
    const exact = "x".repeat(MAX_TRANSCRIPT_CHARS);
    expect(truncateTranscript(exact)).toBe(exact);
  });
});

describe("applyMasteryDelta", () => {
  it("adds and subtracts", () => {
    expect(applyMasteryDelta(50, 15)).toBe(65);
    expect(applyMasteryDelta(50, -10)).toBe(40);
  });

  it("clamps to 0-100 rather than drifting out of range", () => {
    expect(applyMasteryDelta(95, 20)).toBe(100);
    expect(applyMasteryDelta(5, -10)).toBe(0);
    expect(applyMasteryDelta(0, -50)).toBe(0);
    expect(applyMasteryDelta(100, 50)).toBe(100);
  });

  it("rounds fractional input", () => {
    expect(applyMasteryDelta(50.4, 0)).toBe(50);
  });
});

describe("masteryLabel", () => {
  it("names each band, including its boundary", () => {
    expect(masteryLabel(0)).toBe("בהתחלה");
    expect(masteryLabel(29)).toBe("בהתחלה");
    expect(masteryLabel(30)).toBe("בתהליך");
    expect(masteryLabel(59)).toBe("בתהליך");
    expect(masteryLabel(60)).toBe("שליטה טובה");
    expect(masteryLabel(84)).toBe("שליטה טובה");
    expect(masteryLabel(85)).toBe("שליטה מלאה");
    expect(masteryLabel(100)).toBe("שליטה מלאה");
  });
});
