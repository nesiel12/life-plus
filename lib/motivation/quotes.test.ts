import { describe, expect, it } from "vitest";
import { QUOTES, quoteForDate } from "@/lib/motivation/quotes";

describe("quoteForDate", () => {
  it("is stable within a day and rotates across days", () => {
    const a1 = quoteForDate(new Date("2026-09-09T06:00:00Z"));
    const a2 = quoteForDate(new Date("2026-09-09T21:00:00Z"));
    const b = quoteForDate(new Date("2026-09-10T09:00:00Z"));
    expect(a1).toEqual(a2);
    expect(b).not.toEqual(a1);
  });

  it("every quote has text and a source", () => {
    for (const q of QUOTES) {
      expect(q.text.trim().length).toBeGreaterThan(0);
      expect(q.source.trim().length).toBeGreaterThan(0);
    }
  });
});
