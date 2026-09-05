import { describe, expect, it } from "vitest";
import { countEventsByDay, peakCount, type DensityEvent } from "@/lib/calendar/yearDensity";

const YEAR_FROM = new Date(2026, 0, 1);
const YEAR_TO = new Date(2027, 0, 1);

/** A timed event on a local day, given as local wall-clock hours. */
function timed(y: number, m: number, d: number, fromH = 9, toH = 10): DensityEvent {
  return {
    start: new Date(y, m - 1, d, fromH).toISOString(),
    end: new Date(y, m - 1, d, toH).toISOString(),
    isAllDay: false,
  };
}

function allDay(start: string, end: string): DensityEvent {
  return { start, end, isAllDay: true };
}

describe("countEventsByDay", () => {
  it("is empty for no events", () => {
    expect(countEventsByDay([], YEAR_FROM, YEAR_TO)).toEqual({});
  });

  it("counts a timed event on its local day", () => {
    expect(countEventsByDay([timed(2026, 9, 6)], YEAR_FROM, YEAR_TO)).toEqual({ "2026-09-06": 1 });
  });

  it("accumulates several events on one day", () => {
    const events = [timed(2026, 9, 6, 9), timed(2026, 9, 6, 11), timed(2026, 9, 6, 14)];
    expect(countEventsByDay(events, YEAR_FROM, YEAR_TO)["2026-09-06"]).toBe(3);
  });

  it("omits empty days rather than writing zeros", () => {
    const counts = countEventsByDay([timed(2026, 9, 6)], YEAR_FROM, YEAR_TO);
    expect(Object.keys(counts)).toEqual(["2026-09-06"]);
    expect(counts["2026-09-07"]).toBeUndefined();
  });

  // A late-evening event is already tomorrow in UTC; it must still land on
  // the day the user actually had it.
  it("uses the local day, not the UTC day", () => {
    const counts = countEventsByDay([timed(2026, 9, 6, 23, 23)], YEAR_FROM, YEAR_TO);
    expect(counts).toEqual({ "2026-09-06": 1 });
  });

  describe("all-day events", () => {
    it("counts a single all-day event once, treating end as exclusive", () => {
      expect(countEventsByDay([allDay("2026-09-06", "2026-09-07")], YEAR_FROM, YEAR_TO)).toEqual({
        "2026-09-06": 1,
      });
    });

    // The reason this exists: a five-day trip must darken five squares.
    it("counts every day a multi-day event covers", () => {
      expect(countEventsByDay([allDay("2026-09-06", "2026-09-09")], YEAR_FROM, YEAR_TO)).toEqual({
        "2026-09-06": 1,
        "2026-09-07": 1,
        "2026-09-08": 1,
      });
    });

    // "2026-09-06" parsed as a Date is UTC midnight — the previous local day
    // for anyone west of Greenwich.
    it("does not shift an all-day date by a timezone", () => {
      expect(countEventsByDay([allDay("2026-01-01", "2026-01-02")], YEAR_FROM, YEAR_TO)).toEqual({
        "2026-01-01": 1,
      });
    });

    it("survives a malformed date without counting anything", () => {
      expect(countEventsByDay([allDay("not-a-date", "also-not")], YEAR_FROM, YEAR_TO)).toEqual({});
    });

    it("counts at least one day when end is not after start", () => {
      expect(countEventsByDay([allDay("2026-09-06", "2026-09-06")], YEAR_FROM, YEAR_TO)).toEqual({
        "2026-09-06": 1,
      });
    });
  });

  describe("window clamping", () => {
    it("ignores an event entirely outside the window", () => {
      expect(countEventsByDay([timed(2025, 9, 6)], YEAR_FROM, YEAR_TO)).toEqual({});
    });

    it("counts only the in-window days of an event that straddles the start", () => {
      const counts = countEventsByDay([allDay("2025-12-30", "2026-01-03")], YEAR_FROM, YEAR_TO);
      expect(counts).toEqual({ "2026-01-01": 1, "2026-01-02": 1 });
    });

    it("counts only the in-window days of an event that straddles the end", () => {
      const counts = countEventsByDay([allDay("2026-12-30", "2027-01-03")], YEAR_FROM, YEAR_TO);
      expect(counts).toEqual({ "2026-12-30": 1, "2026-12-31": 1 });
    });

    // Without the `cursor < to` guard this walks for a decade.
    it("terminates on an event that claims an absurd span", () => {
      const counts = countEventsByDay([allDay("2026-01-01", "2099-01-01")], YEAR_FROM, YEAR_TO);
      expect(Object.keys(counts)).toHaveLength(365);
    });
  });

  it("covers a leap year day by day", () => {
    const counts = countEventsByDay(
      [allDay("2028-01-01", "2029-01-01")],
      new Date(2028, 0, 1),
      new Date(2029, 0, 1)
    );
    expect(Object.keys(counts)).toHaveLength(366);
    expect(counts["2028-02-29"]).toBe(1);
  });

  it("does not mutate the events it is given", () => {
    const events = [allDay("2026-09-06", "2026-09-09")];
    const snapshot = JSON.stringify(events);
    countEventsByDay(events, YEAR_FROM, YEAR_TO);
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});

describe("peakCount", () => {
  it("is zero for an empty map", () => {
    expect(peakCount({})).toBe(0);
  });

  it("finds the busiest day", () => {
    expect(peakCount({ a: 1, b: 7, c: 3 })).toBe(7);
  });
});
