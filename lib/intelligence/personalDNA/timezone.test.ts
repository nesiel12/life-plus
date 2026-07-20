import { describe, expect, it } from "vitest";
import { getLocalHour, getLocalDayOfWeek } from "@/lib/intelligence/personalDNA/timezone";

describe("getLocalHour", () => {
  it("converts a UTC timestamp to Jerusalem local hour (UTC+3 in summer)", () => {
    // 2026-07-20T17:30:00Z -> 20:30 Asia/Jerusalem (summer, UTC+3)
    expect(getLocalHour("2026-07-20T17:30:00Z")).toBe(20);
  });

  it("wraps midnight correctly", () => {
    // 2026-07-20T21:15:00Z -> 00:15 the next day in Asia/Jerusalem
    expect(getLocalHour("2026-07-20T21:15:00Z")).toBe(0);
  });

  it("respects an explicit timezone override", () => {
    expect(getLocalHour("2026-07-20T12:00:00Z", "UTC")).toBe(12);
  });
});

describe("getLocalDayOfWeek", () => {
  it("matches JS Date.getDay() convention (0 = Sunday)", () => {
    // 2026-07-19 is a Sunday
    expect(getLocalDayOfWeek("2026-07-19T10:00:00Z", "UTC")).toBe(0);
  });

  it("can roll the day forward across a timezone boundary", () => {
    // 2026-07-19T22:00:00Z (Sunday UTC) -> 2026-07-20 01:00 Asia/Jerusalem (Monday)
    expect(getLocalDayOfWeek("2026-07-19T22:00:00Z")).toBe(1);
  });
});
