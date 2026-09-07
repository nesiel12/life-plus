import { describe, expect, it } from "vitest";
import { wallClockToInstant } from "@/lib/commands/wallClock";

describe("wallClockToInstant", () => {
  it("reads the digits in the user's zone, not the runtime's", () => {
    // 10:00 in Jerusalem in September is UTC+3.
    expect(wallClockToInstant("2026-09-08T10:00", "Asia/Jerusalem")).toBe(
      "2026-09-08T07:00:00.000Z"
    );
    // The same digits in New York (UTC-4 in September) are a different instant.
    expect(wallClockToInstant("2026-09-08T10:00", "America/New_York")).toBe(
      "2026-09-08T14:00:00.000Z"
    );
  });

  it("handles winter and summer offsets in the same zone", () => {
    // Israel is UTC+2 in January and UTC+3 in July. A fixed offset would get
    // one of these wrong by an hour.
    expect(wallClockToInstant("2026-01-08T10:00", "Asia/Jerusalem")).toBe(
      "2026-01-08T08:00:00.000Z"
    );
    expect(wallClockToInstant("2026-07-08T10:00", "Asia/Jerusalem")).toBe(
      "2026-07-08T07:00:00.000Z"
    );
  });

  it("lands on the right side of a DST transition", () => {
    // US DST began 2026-03-08 at 02:00 local. 09:00 that morning is EDT.
    expect(wallClockToInstant("2026-03-08T09:00", "America/New_York")).toBe(
      "2026-03-08T13:00:00.000Z"
    );
    // The day before is still EST.
    expect(wallClockToInstant("2026-03-07T09:00", "America/New_York")).toBe(
      "2026-03-07T14:00:00.000Z"
    );
  });

  it("accepts an unpadded hour and a space separator", () => {
    expect(wallClockToInstant("2026-09-08T9:30", "UTC")).toBe("2026-09-08T09:30:00.000Z");
    expect(wallClockToInstant("2026-09-08 09:30", "UTC")).toBe("2026-09-08T09:30:00.000Z");
  });

  it("rejects malformed input rather than inventing a time", () => {
    for (const bad of ["", "tomorrow at ten", "2026-09-08", "2026-13-08T10:00", "2026-09-08T25:00"]) {
      expect(wallClockToInstant(bad, "UTC")).toBeNull();
    }
  });

  it("round-trips midnight without slipping a day", () => {
    expect(wallClockToInstant("2026-09-08T00:00", "Asia/Jerusalem")).toBe(
      "2026-09-07T21:00:00.000Z"
    );
  });
});
