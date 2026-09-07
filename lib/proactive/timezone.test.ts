import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIMEZONE,
  endOfLocalDay,
  isValidTimezone,
  localDayIn,
  localHourIn,
  nextLocalHour,
  nextSendTime,
  resolveUserTimezone,
  startOfLocalDay,
} from "@/lib/proactive/timezone";

describe("isValidTimezone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimezone("Asia/Jerusalem")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
  });

  it("rejects junk, empty values, and absurdly long input", () => {
    expect(isValidTimezone("")).toBe(false);
    expect(isValidTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("x".repeat(200))).toBe(false);
  });
});

describe("resolveUserTimezone", () => {
  it("falls back to the app default for null, undefined, and unknown zones", () => {
    expect(resolveUserTimezone(null)).toBe(DEFAULT_TIMEZONE);
    expect(resolveUserTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
    // A zone that was valid when stored but has since been removed from the
    // runtime's database must not wedge the user's notifications.
    expect(resolveUserTimezone("Mars/Olympus")).toBe(DEFAULT_TIMEZONE);
  });

  it("keeps a valid stored zone", () => {
    expect(resolveUserTimezone("America/New_York")).toBe("America/New_York");
  });
});

describe("localHourIn / localDayIn", () => {
  it("reads the hour in the user's zone, not the host's", () => {
    const at = new Date("2026-03-10T23:30:00Z");
    expect(localHourIn(at, "Asia/Jerusalem")).toBe(1); // next day, UTC+2
    expect(localHourIn(at, "America/New_York")).toBe(19); // same day, UTC-4
  });

  it("rolls the local day over at the user's midnight", () => {
    const at = new Date("2026-03-10T23:30:00Z");
    expect(localDayIn(at, "Asia/Jerusalem")).toBe("2026-03-11");
    expect(localDayIn(at, "America/New_York")).toBe("2026-03-10");
  });
});

describe("startOfLocalDay / endOfLocalDay", () => {
  it("returns the instant the user's day began", () => {
    const at = new Date("2026-03-10T12:00:00Z"); // 14:00 in Jerusalem (UTC+2)
    const start = startOfLocalDay(at, "Asia/Jerusalem");
    expect(start.toISOString()).toBe("2026-03-09T22:00:00.000Z");
    expect(localHourIn(start, "Asia/Jerusalem")).toBe(0);
  });

  it("bounds the day correctly on the far side of the world", () => {
    // 08:00 in New York, which is already on DST (began 2026-03-08) and so
    // is UTC-4 — making local midnight 04:00Z, not the 05:00Z that a
    // standard-time assumption would give.
    const at = new Date("2026-03-10T12:00:00Z");
    const start = startOfLocalDay(at, "America/New_York");
    expect(start.toISOString()).toBe("2026-03-10T04:00:00.000Z");
    expect(localHourIn(start, "America/New_York")).toBe(0);
  });

  it("lands on the next real midnight across a spring-forward DST change", () => {
    // US DST began 2026-03-08. A 23-hour local day must still end at midnight.
    const at = new Date("2026-03-08T12:00:00Z");
    const end = endOfLocalDay(at, "America/New_York");
    expect(localHourIn(end, "America/New_York")).toBe(0);
    expect(localDayIn(end, "America/New_York")).toBe("2026-03-09");
  });

  it("lands on the next real midnight across an autumn fall-back DST change", () => {
    // A 25-hour local day — the case a naive +24h would get wrong.
    const at = new Date("2026-11-01T12:00:00Z");
    const end = endOfLocalDay(at, "America/New_York");
    expect(localHourIn(end, "America/New_York")).toBe(0);
    expect(localDayIn(end, "America/New_York")).toBe("2026-11-02");
  });
});

describe("nextLocalHour", () => {
  it("returns today's occurrence when it is still ahead", () => {
    const at = new Date("2026-03-10T02:00:00Z"); // 04:00 Jerusalem
    const next = nextLocalHour(at, "Asia/Jerusalem", 7);
    expect(localHourIn(next, "Asia/Jerusalem")).toBe(7);
    expect(localDayIn(next, "Asia/Jerusalem")).toBe("2026-03-10");
  });

  it("rolls to tomorrow when the hour has already passed", () => {
    const at = new Date("2026-03-10T12:00:00Z"); // 14:00 Jerusalem
    const next = nextLocalHour(at, "Asia/Jerusalem", 7);
    expect(localHourIn(next, "Asia/Jerusalem")).toBe(7);
    expect(localDayIn(next, "Asia/Jerusalem")).toBe("2026-03-11");
  });
});

describe("nextSendTime", () => {
  const QUIET_START = 22;
  const QUIET_END = 7;

  it("sends immediately when the local hour is outside quiet hours", () => {
    const at = new Date("2026-03-10T09:13:00Z"); // 11:13 Jerusalem
    expect(nextSendTime(at, "Asia/Jerusalem", QUIET_START, QUIET_END)).toBe(at);
  });

  it("defers an overnight nudge to the end of the quiet window", () => {
    const at = new Date("2026-03-10T01:00:00Z"); // 03:00 Jerusalem — quiet
    const send = nextSendTime(at, "Asia/Jerusalem", QUIET_START, QUIET_END);
    expect(localHourIn(send, "Asia/Jerusalem")).toBe(7);
    expect(localDayIn(send, "Asia/Jerusalem")).toBe("2026-03-10");
  });

  it("defers a late-evening nudge to the next morning, not the same one", () => {
    const at = new Date("2026-03-10T21:00:00Z"); // 23:00 Jerusalem — quiet
    const send = nextSendTime(at, "Asia/Jerusalem", QUIET_START, QUIET_END);
    expect(localHourIn(send, "Asia/Jerusalem")).toBe(7);
    expect(localDayIn(send, "Asia/Jerusalem")).toBe("2026-03-11");
  });

  it("honours each user's own zone for the same instant", () => {
    const at = new Date("2026-03-10T01:00:00Z");
    // 03:00 in Jerusalem (quiet) but 20:00 the previous evening in New York.
    expect(nextSendTime(at, "America/New_York", QUIET_START, QUIET_END)).toBe(at);
  });
});
