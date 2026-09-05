import { describe, expect, it } from "vitest";
import {
  dateKey,
  daysInMonth,
  isCalendarRange,
  isSameDay,
  isWithinRange,
  monthKey,
  rangeBounds,
  rangeLabel,
  startOfWeek,
  stepAnchor,
  weekDays,
} from "@/lib/calendar/ranges";

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("dateKey", () => {
  it("uses the local date, not UTC", () => {
    // Late evening local time is already the next day in UTC for anyone east
    // of Greenwich; toISOString().slice(0,10) would report tomorrow.
    expect(dateKey(new Date(2026, 8, 6, 23, 30))).toBe("2026-09-06");
  });

  it("pads single-digit months and days", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("monthKey", () => {
  it("formats as YYYY-MM", () => {
    expect(monthKey(at(2026, 9, 6))).toBe("2026-09");
    expect(monthKey(at(2026, 12, 31))).toBe("2026-12");
  });
});

describe("daysInMonth", () => {
  it("knows the short months", () => {
    expect(daysInMonth(2026, 3)).toBe(30); // April
    expect(daysInMonth(2026, 0)).toBe(31); // January
  });

  it("handles February in common and leap years", () => {
    expect(daysInMonth(2026, 1)).toBe(28);
    expect(daysInMonth(2028, 1)).toBe(29);
    // Century rule: 1900 was not a leap year, 2000 was.
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });
});

describe("startOfWeek", () => {
  it("returns Sunday for a midweek date", () => {
    // 2026-09-06 is a Sunday; 2026-09-09 is the Wednesday after it.
    expect(dateKey(startOfWeek(at(2026, 9, 9)))).toBe("2026-09-06");
  });

  it("is a no-op on Sunday itself", () => {
    expect(dateKey(startOfWeek(at(2026, 9, 6)))).toBe("2026-09-06");
  });

  it("crosses back into the previous month when the week straddles one", () => {
    // 2026-10-01 is a Thursday; its week starts 2026-09-27.
    expect(dateKey(startOfWeek(at(2026, 10, 1)))).toBe("2026-09-27");
  });

  it("strips the time", () => {
    const s = startOfWeek(at(2026, 9, 9, 23));
    expect([s.getHours(), s.getMinutes(), s.getSeconds()]).toEqual([0, 0, 0]);
  });
});

describe("weekDays", () => {
  it("returns seven consecutive days starting Sunday", () => {
    expect(weekDays(at(2026, 9, 9)).map(dateKey)).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("spans a month boundary without skipping a day", () => {
    expect(weekDays(at(2026, 10, 1)).map(dateKey)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });
});

describe("rangeBounds", () => {
  it("bounds a day", () => {
    const { from, to } = rangeBounds("day", at(2026, 9, 6, 15));
    expect([dateKey(from), dateKey(to)]).toEqual(["2026-09-06", "2026-09-07"]);
    expect(from.getHours()).toBe(0);
  });

  it("bounds a week Sunday to Sunday", () => {
    const { from, to } = rangeBounds("week", at(2026, 9, 9));
    expect([dateKey(from), dateKey(to)]).toEqual(["2026-09-06", "2026-09-13"]);
  });

  it("bounds a month to the first of the next", () => {
    const { from, to } = rangeBounds("month", at(2026, 9, 20));
    expect([dateKey(from), dateKey(to)]).toEqual(["2026-09-01", "2026-10-01"]);
  });

  it("rolls the year over in December", () => {
    const { to } = rangeBounds("month", at(2026, 12, 5));
    expect(dateKey(to)).toBe("2027-01-01");
  });

  it("bounds a year", () => {
    const { from, to } = rangeBounds("year", at(2026, 7, 4));
    expect([dateKey(from), dateKey(to)]).toEqual(["2026-01-01", "2027-01-01"]);
  });

  // Half-open: midnight belongs to the day starting, not the one ending.
  it("excludes the upper bound so adjacent ranges never double-count", () => {
    const midnight = new Date(2026, 8, 7);
    expect(isWithinRange("day", at(2026, 9, 6), midnight)).toBe(false);
    expect(isWithinRange("day", at(2026, 9, 7), midnight)).toBe(true);
  });
});

describe("stepAnchor", () => {
  it("steps days, weeks and years", () => {
    expect(dateKey(stepAnchor("day", at(2026, 9, 6), 1))).toBe("2026-09-07");
    expect(dateKey(stepAnchor("week", at(2026, 9, 6), 1))).toBe("2026-09-13");
    expect(dateKey(stepAnchor("year", at(2026, 9, 6), 1))).toBe("2027-09-06");
  });

  it("steps backwards across a year boundary", () => {
    expect(dateKey(stepAnchor("day", at(2026, 1, 1), -1))).toBe("2025-12-31");
    expect(dateKey(stepAnchor("month", at(2026, 1, 15), -1))).toBe("2025-12-15");
  });

  // The classic off-by-a-rollover: new Date(2026, 1, 31) is 3 March.
  it("clamps the day when the target month is shorter", () => {
    expect(dateKey(stepAnchor("month", at(2026, 1, 31), 1))).toBe("2026-02-28");
    expect(dateKey(stepAnchor("month", at(2026, 3, 31), 1))).toBe("2026-04-30");
    expect(dateKey(stepAnchor("month", at(2026, 5, 31), -1))).toBe("2026-04-30");
  });

  it("clamps 29 February when stepping to a common year", () => {
    expect(dateKey(stepAnchor("year", at(2028, 2, 29), 1))).toBe("2029-02-28");
  });

  it("keeps the day when the target month is long enough", () => {
    expect(dateKey(stepAnchor("month", at(2026, 1, 15), 1))).toBe("2026-02-15");
  });

  it("is a no-op at delta 0", () => {
    expect(dateKey(stepAnchor("month", at(2026, 9, 6), 0))).toBe("2026-09-06");
  });

  // Twelve single steps must land where one twelve-step lands.
  it("does not drift when stepped repeatedly", () => {
    let d = at(2026, 1, 15);
    for (let i = 0; i < 12; i++) d = stepAnchor("month", d, 1);
    expect(dateKey(d)).toBe("2027-01-15");
  });

  it("does not drift across a DST transition when stepping days", () => {
    // Whatever the host timezone, stepping a day must always advance the
    // calendar date by exactly one and keep the time-of-day at midnight-safe
    // values — ms arithmetic fails this on the transition day.
    let d = new Date(2026, 2, 25);
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) {
      d = stepAnchor("day", d, 1);
      seen.push(dateKey(d));
    }
    expect(seen).toEqual([
      "2026-03-26",
      "2026-03-27",
      "2026-03-28",
      "2026-03-29",
      "2026-03-30",
      "2026-03-31",
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
    ]);
  });
});

describe("isSameDay", () => {
  it("ignores the time", () => {
    expect(isSameDay(new Date(2026, 8, 6, 1), new Date(2026, 8, 6, 23))).toBe(true);
  });

  it("separates adjacent days", () => {
    expect(isSameDay(new Date(2026, 8, 6, 23, 59), new Date(2026, 8, 7, 0, 1))).toBe(false);
  });
});

describe("rangeLabel", () => {
  it("names the month and year", () => {
    expect(rangeLabel("month", at(2026, 9, 6))).toContain("2026");
  });

  it("gives the year alone for the year range", () => {
    expect(rangeLabel("year", at(2026, 9, 6))).toBe("2026");
  });

  // A week spanning two months must name both, or "27–3" reads as nonsense.
  it("names both months when the week straddles one", () => {
    const label = rangeLabel("week", at(2026, 10, 1));
    expect(label).toContain("–");
    expect(label.split("–")[0]).toMatch(/\d/);
    // The first half carries its own month name in the straddling case.
    expect(label.split("–")[0].trim().length).toBeGreaterThan(2);
  });

  it("gives a bare day number for the first half of a within-month week", () => {
    expect(rangeLabel("week", at(2026, 9, 9)).split("–")[0].trim()).toBe("6");
  });
});

describe("isCalendarRange", () => {
  it("accepts the four ranges and rejects anything else", () => {
    expect(["day", "week", "month", "year"].every(isCalendarRange)).toBe(true);
    expect(isCalendarRange("decade")).toBe(false);
    expect(isCalendarRange("")).toBe(false);
  });
});
