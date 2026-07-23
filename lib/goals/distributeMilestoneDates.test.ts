import { describe, expect, it } from "vitest";
import { distributeMilestoneDates } from "@/lib/goals/distributeMilestoneDates";

describe("distributeMilestoneDates", () => {
  it("returns an empty array for zero milestones", () => {
    expect(distributeMilestoneDates(0, new Date("2026-01-01"), new Date("2026-06-01"))).toEqual([]);
  });

  it("returns all-null when there's no target date — never guesses a timeline", () => {
    expect(distributeMilestoneDates(4, new Date("2026-01-01"), null)).toEqual([null, null, null, null]);
  });

  it("returns all-null when the target date is in the past relative to the start", () => {
    expect(distributeMilestoneDates(3, new Date("2026-06-01"), new Date("2026-01-01"))).toEqual([null, null, null]);
  });

  it("spreads milestones evenly, with the last one landing on the target date", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const target = new Date("2026-01-05T00:00:00.000Z"); // 4 days
    const dates = distributeMilestoneDates(4, start, target);
    expect(dates).toEqual(["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"]);
  });

  it("maps the wedding-planning test case (\"9.8.26\" -> 2026-08-09) to a real spread of dates", () => {
    const start = new Date("2026-07-23T00:00:00.000Z");
    const target = new Date("2026-08-09T00:00:00.000Z");
    const dates = distributeMilestoneDates(5, start, target);
    expect(dates).toHaveLength(5);
    expect(dates[dates.length - 1]).toBe("2026-08-09");
    // Strictly increasing.
    for (let i = 1; i < dates.length; i++) {
      expect(new Date(dates[i] as string).getTime()).toBeGreaterThan(new Date(dates[i - 1] as string).getTime());
    }
  });
});
