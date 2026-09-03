import { describe, expect, it } from "vitest";
import { getLocalHour, getLocalDayOfWeek, getLocalWallClock } from "@/lib/intelligence/personalDNA/timezone";

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

describe("getLocalWallClock", () => {
  it("formats as YYYY-MM-DDTHH:MM in Jerusalem local time (UTC+3 in summer)", () => {
    expect(getLocalWallClock("2026-07-20T17:30:00Z")).toBe("2026-07-20T20:30");
  });

  it("rolls the date forward across midnight, not just the hour", () => {
    // Same instant getLocalHour's midnight-wrap test uses — the date part
    // must roll too, not just wrap the hour back to 00 on the same day.
    expect(getLocalWallClock("2026-07-20T21:15:00Z")).toBe("2026-07-21T00:15");
  });

  it("pads single-digit month, day, hour and minute", () => {
    expect(getLocalWallClock("2026-01-05T05:03:00Z", "UTC")).toBe("2026-01-05T05:03");
  });

  it("respects an explicit timezone override", () => {
    expect(getLocalWallClock("2026-07-20T12:00:00Z", "UTC")).toBe("2026-07-20T12:00");
  });

  it("produces a string parseLocalDateTime (lib/ai/agents/calendarAgent.ts) accepts", () => {
    expect(getLocalWallClock("2026-07-20T17:30:00Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
