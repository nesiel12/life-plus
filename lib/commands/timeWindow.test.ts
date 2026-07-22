import { describe, expect, it } from "vitest";
import { addDaysToDateKey, buildCommandTimeWindow, jerusalemUtcOffsetMinutes } from "@/lib/commands/timeWindow";

describe("jerusalemUtcOffsetMinutes", () => {
  it("reads standard time (UTC+2) in mid-January", () => {
    expect(jerusalemUtcOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(120);
  });

  it("reads daylight time (UTC+3) in mid-July", () => {
    expect(jerusalemUtcOffsetMinutes(new Date("2026-07-15T12:00:00Z"))).toBe(180);
  });
});

describe("addDaysToDateKey", () => {
  it("adds days within the same month", () => {
    expect(addDaysToDateKey("2026-07-15", 1)).toBe("2026-07-16");
  });

  it("rolls over into the next month", () => {
    expect(addDaysToDateKey("2026-07-31", 1)).toBe("2026-08-01");
  });

  it("rolls over into the next year", () => {
    expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("buildCommandTimeWindow", () => {
  it("computes today's evening window in daylight time (UTC+3)", () => {
    const now = new Date("2026-07-15T08:00:00Z"); // 11:00 local, same calendar day
    const window = buildCommandTimeWindow("evening", "today", now);
    expect(window.timeMin).toBe("2026-07-15T14:00:00.000Z"); // 17:00 local - 3h
    expect(window.timeMax).toBe("2026-07-15T18:00:00.000Z"); // 21:00 local - 3h
  });

  it("computes today's evening window in standard time (UTC+2)", () => {
    const now = new Date("2026-01-15T08:00:00Z"); // 10:00 local
    const window = buildCommandTimeWindow("evening", "today", now);
    expect(window.timeMin).toBe("2026-01-15T15:00:00.000Z"); // 17:00 local - 2h
    expect(window.timeMax).toBe("2026-01-15T19:00:00.000Z"); // 21:00 local - 2h
  });

  it("spans midnight (and rolls the calendar day) for the night period", () => {
    const now = new Date("2026-07-31T20:00:00Z"); // 23:00 local, still July 31
    const window = buildCommandTimeWindow("night", "today", now);
    expect(window.timeMin).toBe("2026-07-31T18:00:00.000Z"); // 21:00 local July 31
    expect(window.timeMax).toBe("2026-08-01T02:00:00.000Z"); // 05:00 local Aug 1
  });

  it("resolves \"tomorrow\" to the following local calendar day", () => {
    const now = new Date("2026-01-15T08:00:00Z"); // 10:00 local, Jan 15
    const window = buildCommandTimeWindow("morning", "tomorrow", now);
    expect(window.timeMin).toBe("2026-01-16T03:00:00.000Z"); // 05:00 local Jan 16
    expect(window.timeMax).toBe("2026-01-16T10:00:00.000Z"); // 12:00 local Jan 16
  });
});
