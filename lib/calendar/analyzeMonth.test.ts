import { describe, expect, it } from "vitest";
import { analyzeMonth, type MonthEvent } from "@/lib/calendar/analyzeMonth";
import type { ChronotypeSettings } from "@/types";

// Local-time construction, matching findFocusSlots.test.ts's convention —
// the analysis works in the user's own day, so tests must build instants the
// same way rather than hardcoding UTC.
function ev(day: number, startHour: number, endHour: number, title = "אירוע"): MonthEvent {
  return {
    title,
    start: new Date(2026, 8, day, startHour, 0, 0, 0).toISOString(),
    end: new Date(2026, 8, day, endHour, 0, 0, 0).toISOString(),
  };
}

const MONTH = "2026-09";

const chronotype: ChronotypeSettings = {
  wakeTime: "06:30",
  sleepTime: "23:00",
  peakFocusHours: ["morning"], // 08:00-12:00
  lowEnergyHours: ["afternoon"], // 12:00-16:00
};

describe("analyzeMonth", () => {
  it("reports an honest empty analysis for a month with nothing in it", () => {
    const result = analyzeMonth(MONTH, []);
    expect(result.eventCount).toBe(0);
    expect(result.totalHours).toBe(0);
    expect(result.activeDays).toBe(0);
    expect(result.busiestDay).toBeNull();
    expect(result.averageHoursPerActiveDay).toBe(0);
    expect(result.byDayPart).toEqual([]);
  });

  it("totals real scheduled hours", () => {
    const result = analyzeMonth(MONTH, [ev(1, 9, 11), ev(2, 14, 15)]);
    expect(result.totalHours).toBe(3);
    expect(result.eventCount).toBe(2);
  });

  it("counts all-day events but gives them no hours", () => {
    // Folding all-day events in as 24h each would swamp every other figure.
    const result = analyzeMonth(MONTH, [
      ev(1, 9, 11),
      { title: "חופשה", start: new Date(2026, 8, 3).toISOString(), end: new Date(2026, 8, 4).toISOString(), isAllDay: true },
    ]);
    expect(result.eventCount).toBe(2);
    expect(result.allDayCount).toBe(1);
    expect(result.totalHours).toBe(2);
  });

  it("finds the genuinely busiest day, summing multiple events on it", () => {
    const result = analyzeMonth(MONTH, [ev(1, 9, 10), ev(2, 9, 11), ev(2, 14, 16)]);
    expect(result.busiestDay?.date).toBe("2026-09-02");
    expect(result.busiestDay?.hours).toBe(4);
  });

  it("averages only over days that actually had something scheduled", () => {
    // 2 days active, 6 hours total -> 3, not 6/30.
    const result = analyzeMonth(MONTH, [ev(1, 9, 12), ev(2, 9, 12)]);
    expect(result.activeDays).toBe(2);
    expect(result.averageHoursPerActiveDay).toBe(3);
  });

  it("breaks hours down by day part, ranked", () => {
    const result = analyzeMonth(MONTH, [ev(1, 9, 12), ev(2, 20, 21)]);
    expect(result.byDayPart[0].part).toBe("morning");
    expect(result.byDayPart[0].hours).toBe(3);
    expect(result.byDayPart[0].share).toBeCloseTo(0.75);
    expect(result.byDayPart[1].part).toBe("night");
  });

  it("breaks hours down by weekday, omitting empty ones", () => {
    // 2026-09-01 is a Tuesday (getDay() === 2).
    const result = analyzeMonth(MONTH, [ev(1, 9, 11)]);
    expect(result.byWeekday).toHaveLength(1);
    expect(result.byWeekday[0].weekday).toBe(2);
    expect(result.byWeekday[0].label).toBe("שלישי");
    expect(result.byWeekday[0].eventCount).toBe(1);
  });

  describe("energy attribution", () => {
    it("splits hours across the user's own peak and low windows", () => {
      const result = analyzeMonth(MONTH, [ev(1, 9, 11), ev(2, 13, 15)], chronotype);
      expect(result.peakHours).toBe(2); // 09:00 is in "morning"
      expect(result.lowEnergyHours).toBe(2); // 13:00 is in "afternoon"
    });

    it("reports null rather than a misleading zero when no chronotype is known", () => {
      const result = analyzeMonth(MONTH, [ev(1, 9, 11)]);
      expect(result.peakHours).toBeNull();
      expect(result.lowEnergyHours).toBeNull();
    });

    it("attributes a long event to the band it starts in, not every band it spans", () => {
      const result = analyzeMonth(MONTH, [ev(1, 9, 15)], chronotype);
      expect(result.peakHours).toBe(6);
      expect(result.lowEnergyHours).toBe(0);
    });
  });

  describe("free streaks", () => {
    it("finds the longest run of days with nothing scheduled", () => {
      // Something on the 1st and the 10th -> the 2nd..9th is an 8-day gap,
      // but the 11th..30th is a 20-day one.
      const result = analyzeMonth(MONTH, [ev(1, 9, 10), ev(10, 9, 10)]);
      expect(result.longestFreeStreakDays).toBe(20);
    });

    it("counts a whole empty month as free", () => {
      expect(analyzeMonth(MONTH, []).longestFreeStreakDays).toBe(30);
    });

    it("respects month length", () => {
      // February 2026 has 28 days.
      expect(analyzeMonth("2026-02", []).longestFreeStreakDays).toBe(28);
    });
  });

  describe("bad input", () => {
    it("skips an event with an unparseable date instead of throwing", () => {
      const result = analyzeMonth(MONTH, [{ title: "x", start: "nonsense", end: "also nonsense" }, ev(1, 9, 11)]);
      expect(result.totalHours).toBe(2);
    });

    it("skips an inverted event rather than subtracting negative hours", () => {
      const result = analyzeMonth(MONTH, [ev(1, 11, 9), ev(2, 9, 11)]);
      expect(result.totalHours).toBe(2);
    });

    it("skips a zero-length event", () => {
      const result = analyzeMonth(MONTH, [ev(1, 9, 9), ev(2, 9, 11)]);
      expect(result.totalHours).toBe(2);
      expect(result.activeDays).toBe(1);
    });
  });
});
