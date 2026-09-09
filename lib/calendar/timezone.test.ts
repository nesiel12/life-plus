import { describe, expect, it } from "vitest";
import { zonedWallClockToInstant } from "@/lib/calendar/timezone";

describe("zonedWallClockToInstant", () => {
  it("resolves an Israel summer wall clock (UTC+3) to the right instant", () => {
    const d = zonedWallClockToInstant("2026-09-10T12:30", "Asia/Jerusalem");
    // 12:30 IDT == 09:30 UTC
    expect(d?.toISOString()).toBe("2026-09-10T09:30:00.000Z");
  });

  it("resolves an Israel winter wall clock (UTC+2)", () => {
    const d = zonedWallClockToInstant("2026-01-15T08:00", "Asia/Jerusalem");
    expect(d?.toISOString()).toBe("2026-01-15T06:00:00.000Z");
  });

  it("resolves a New York wall clock", () => {
    const d = zonedWallClockToInstant("2026-07-04T18:00", "America/New_York");
    // 18:00 EDT == 22:00 UTC
    expect(d?.toISOString()).toBe("2026-07-04T22:00:00.000Z");
  });

  it("treats UTC as a no-op", () => {
    expect(zonedWallClockToInstant("2026-03-01T14:00", "UTC")?.toISOString()).toBe(
      "2026-03-01T14:00:00.000Z"
    );
  });

  it("returns null for a malformed string", () => {
    expect(zonedWallClockToInstant("not a date", "UTC")).toBeNull();
    expect(zonedWallClockToInstant("2026-13-40T00:00", "UTC")).toBeNull();
  });
});
