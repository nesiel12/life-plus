import { describe, expect, it } from "vitest";
import { parseHebrewEvent } from "@/lib/calendar/parseHebrewEvent";

// 2026-09-15 is a Tuesday (getDay() === 2).
const NOW = new Date(2026, 8, 15, 10, 0, 0, 0);

describe("parseHebrewEvent", () => {
  it("parses the exact case from the directive", () => {
    const result = parseHebrewEvent("מחר פגישה ב13:00", NOW);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("פגישה");
    expect(result!.start).toBe("2026-09-16T13:00");
    expect(result!.durationMinutes).toBe(60);
  });

  describe("times", () => {
    it("parses a colon time with a hyphen prefix", () => {
      expect(parseHebrewEvent("מחר פגישה ב-13:00", NOW)!.start).toBe("2026-09-16T13:00");
    });

    it("keeps real minutes", () => {
      expect(parseHebrewEvent("מחר פגישה ב-9:30", NOW)!.start).toBe("2026-09-16T09:30");
    });

    it("parses an hour with no minutes", () => {
      expect(parseHebrewEvent("מחר פגישה ב-14", NOW)!.start).toBe("2026-09-16T14:00");
    });

    it("parses בשעה", () => {
      expect(parseHebrewEvent("מחר פגישה בשעה 8", NOW)!.start).toBe("2026-09-16T08:00");
    });

    it("reads an afternoon qualifier as PM", () => {
      expect(parseHebrewEvent("מחר פגישה ב-3 אחה״צ", NOW)!.start).toBe("2026-09-16T15:00");
    });

    it("does not shift an hour that is already PM", () => {
      expect(parseHebrewEvent("מחר פגישה ב-15 בערב", NOW)!.start).toBe("2026-09-16T15:00");
    });

    it("rejects an impossible hour rather than wrapping it", () => {
      expect(parseHebrewEvent("מחר פגישה ב-99:00", NOW)).toBeNull();
    });
  });

  describe("dates", () => {
    it("defaults to today when no date is mentioned", () => {
      expect(parseHebrewEvent("פגישה ב-16:00", NOW)!.start).toBe("2026-09-15T16:00");
    });

    it("parses היום", () => {
      expect(parseHebrewEvent("היום פגישה ב-16:00", NOW)!.start).toBe("2026-09-15T16:00");
    });

    it("parses מחרתיים without matching מחר first", () => {
      expect(parseHebrewEvent("מחרתיים פגישה ב-13:00", NOW)!.start).toBe("2026-09-17T13:00");
    });

    it("resolves a named weekday to its next occurrence", () => {
      // Tuesday -> next Thursday is 2 days on.
      expect(parseHebrewEvent("ביום חמישי פגישה ב-13:00", NOW)!.start).toBe("2026-09-17T13:00");
    });

    it("treats the current weekday as a week out, never as the past", () => {
      // Said on a Tuesday, "ביום שלישי" means next Tuesday.
      expect(parseHebrewEvent("ביום שלישי פגישה ב-13:00", NOW)!.start).toBe("2026-09-22T13:00");
    });

    it("rolls the month over correctly", () => {
      const endOfMonth = new Date(2026, 8, 30, 10, 0, 0, 0);
      expect(parseHebrewEvent("מחר פגישה ב-13:00", endOfMonth)!.start).toBe("2026-10-01T13:00");
    });
  });

  describe("titles", () => {
    it("strips the date and time out of the title", () => {
      expect(parseHebrewEvent("מחר פגישה ב-13:00", NOW)!.title).toBe("פגישה");
    });

    it("keeps a multi-word title intact", () => {
      expect(parseHebrewEvent("מחר פגישה עם דנה ב-13:00", NOW)!.title).toBe("פגישה עם דנה");
    });

    it("strips command noise", () => {
      expect(parseHebrewEvent("קבע לי מחר פגישה ב-13:00", NOW)!.title).toBe("פגישה");
    });

    it("strips a stranded part-of-day qualifier", () => {
      expect(parseHebrewEvent("מחר פגישה ב-3 אחה״צ", NOW)!.title).toBe("פגישה");
    });

    it("handles the title coming before the date", () => {
      expect(parseHebrewEvent("פגישה עם הרופא מחר ב-9:00", NOW)!.title).toBe("פגישה עם הרופא");
    });
  });

  describe("refuses to guess", () => {
    // The core safety property: no explicit time means no event. A silently
    // wrong calendar entry is worse than an honest failure.
    it("returns null with no time at all", () => {
      expect(parseHebrewEvent("מחר פגישה", NOW)).toBeNull();
    });

    it("does not read a bare number as an hour", () => {
      expect(parseHebrewEvent("מחר פגישה 3", NOW)).toBeNull();
    });

    it("returns null for empty or whitespace input", () => {
      expect(parseHebrewEvent("", NOW)).toBeNull();
      expect(parseHebrewEvent("   ", NOW)).toBeNull();
    });

    it("returns null when nothing is left to call the event", () => {
      expect(parseHebrewEvent("מחר ב-13:00", NOW)).toBeNull();
    });
  });

  it("produces a string parseLocalDateTime accepts", () => {
    expect(parseHebrewEvent("מחר פגישה ב13:00", NOW)!.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
