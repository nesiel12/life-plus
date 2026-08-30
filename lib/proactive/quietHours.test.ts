import { describe, it, expect } from "vitest";
import { isWithinQuietHours, nextAllowedHour } from "@/lib/proactive/quietHours";

describe("isWithinQuietHours", () => {
  it("handles a window that wraps midnight (22 → 7)", () => {
    expect(isWithinQuietHours(23, 22, 7)).toBe(true);
    expect(isWithinQuietHours(3, 22, 7)).toBe(true);
    expect(isWithinQuietHours(7, 22, 7)).toBe(false); // end is exclusive
    expect(isWithinQuietHours(22, 22, 7)).toBe(true); // start is inclusive
    expect(isWithinQuietHours(12, 22, 7)).toBe(false);
  });

  it("handles a same-day window (13 → 15)", () => {
    expect(isWithinQuietHours(14, 13, 15)).toBe(true);
    expect(isWithinQuietHours(15, 13, 15)).toBe(false);
    expect(isWithinQuietHours(9, 13, 15)).toBe(false);
  });

  it("a zero-width window is never quiet", () => {
    expect(isWithinQuietHours(9, 9, 9)).toBe(false);
  });
});

describe("nextAllowedHour", () => {
  it("returns the hour unchanged when already allowed", () => {
    expect(nextAllowedHour(10, 22, 7)).toBe(10);
  });

  it("skips to the end of a wrapping quiet window", () => {
    expect(nextAllowedHour(2, 22, 7)).toBe(7);
    expect(nextAllowedHour(23, 22, 7)).toBe(7);
  });

  it("normalises out-of-range input", () => {
    expect(nextAllowedHour(26, 22, 7)).toBe(7); // 26 → 2 → 7
    expect(nextAllowedHour(-1, 22, 7)).toBe(7); // -1 → 23 → 7
  });
});
