import { describe, expect, it } from "vitest";
import { describeHeavyDay, findHeavyDays, type DayLoad } from "@/lib/proactive/jobs/busyWeekScan";

function load(day: string, events: number, hours: number): DayLoad {
  return { day, events, hours };
}

describe("findHeavyDays", () => {
  it("returns nothing for an ordinary week", () => {
    expect(
      findHeavyDays([load("2026-03-10", 2, 3), load("2026-03-11", 3, 4.5), load("2026-03-12", 0, 0)])
    ).toEqual([]);
  });

  it("flags a day by booked hours", () => {
    const heavy = findHeavyDays([load("2026-03-10", 3, 9)]);
    expect(heavy.map((d) => d.day)).toEqual(["2026-03-10"]);
  });

  it("flags a day by sheer number of commitments, even when each is short", () => {
    // Six 20-minute calls is two hours of time and a shredded day. Hours
    // alone would call this a light day.
    const heavy = findHeavyDays([load("2026-03-10", 6, 2)]);
    expect(heavy.map((d) => d.day)).toEqual(["2026-03-10"]);
  });

  it("sorts the heaviest day first", () => {
    const heavy = findHeavyDays([
      load("2026-03-10", 6, 2),
      load("2026-03-11", 4, 11),
      load("2026-03-12", 3, 9),
    ]);
    expect(heavy.map((d) => d.day)).toEqual(["2026-03-11", "2026-03-12", "2026-03-10"]);
  });

  it("breaks an hours tie on the number of events", () => {
    const heavy = findHeavyDays([load("2026-03-10", 3, 9), load("2026-03-11", 8, 9)]);
    expect(heavy[0].day).toBe("2026-03-11");
  });

  it("does not flag a day sitting just under both thresholds", () => {
    expect(findHeavyDays([load("2026-03-10", 5, 7.9)])).toEqual([]);
  });
});

describe("describeHeavyDay", () => {
  it("names the weekday and rounds the hours", () => {
    const text = describeHeavyDay(load("2026-03-10", 6, 8.6), "Asia/Jerusalem");
    expect(text).toContain("6 אירועים");
    expect(text).toContain("9 שעות");
  });

  it("reads the date in the user's zone, not the host's", () => {
    // Rendered from a noon instant precisely so the day cannot slip either
    // way — both of these must name the same date.
    const jerusalem = describeHeavyDay(load("2026-03-10", 6, 8), "Asia/Jerusalem");
    const newYork = describeHeavyDay(load("2026-03-10", 6, 8), "America/New_York");
    expect(jerusalem.slice(0, jerusalem.indexOf("—"))).toBe(
      newYork.slice(0, newYork.indexOf("—"))
    );
  });
});
