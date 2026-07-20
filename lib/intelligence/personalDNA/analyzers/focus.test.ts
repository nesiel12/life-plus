import { describe, expect, it } from "vitest";
import { analyzeFocusPatterns } from "@/lib/intelligence/personalDNA/analyzers/focus";

// Times chosen so getLocalHour (Asia/Jerusalem, UTC+3 in July) lands solidly
// inside the "evening" window (18:00-22:00 local).
const EVENING_UTC = "2026-07-2{d}T17:30:00Z"; // -> 20:30 local

function eveningMoment(day: number, category: "knowledge" | "family" = "knowledge") {
  return { category, occurredAt: EVENING_UTC.replace("{d}", String(day)) };
}

describe("analyzeFocusPatterns", () => {
  it("produces no pattern below the minimum evidence threshold", () => {
    const moments = [eveningMoment(1), eveningMoment(2), eveningMoment(3)];
    expect(analyzeFocusPatterns(moments)).toEqual([]);
  });

  it("detects a concentrated evening pattern for a category with enough evidence", () => {
    const moments = [1, 2, 3, 4, 5].map((d) => eveningMoment(d));
    const result = analyzeFocusPatterns(moments);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: "focus",
      patternType: "peakActivityWindow",
      subject: "knowledge",
      value: "evening",
      evidenceCount: 5,
      strength: 1,
    });
    expect(result[0].description).toContain("ידע");
    expect(result[0].description).toContain("18:00");
  });

  it("produces separate patterns per category", () => {
    const moments = [
      ...[1, 2, 3, 4, 5].map((d) => eveningMoment(d, "knowledge")),
      ...[1, 2, 3, 4, 5].map((d) => eveningMoment(d, "family")),
    ];
    const result = analyzeFocusPatterns(moments);
    expect(result.map((p) => p.subject).sort()).toEqual(["family", "knowledge"]);
  });

  it("lowers strength when activity is spread across multiple windows", () => {
    const moments = [
      { category: "knowledge" as const, occurredAt: "2026-07-01T05:30:00Z" }, // 08:30 local -> morning
      { category: "knowledge" as const, occurredAt: "2026-07-02T05:30:00Z" },
      { category: "knowledge" as const, occurredAt: "2026-07-03T17:30:00Z" }, // 20:30 local -> evening
      { category: "knowledge" as const, occurredAt: "2026-07-04T17:30:00Z" },
      { category: "knowledge" as const, occurredAt: "2026-07-05T17:30:00Z" },
    ];
    const result = analyzeFocusPatterns(moments);
    expect(result[0].value).toBe("evening");
    expect(result[0].strength).toBeCloseTo(3 / 5);
  });
});
