import { describe, expect, it } from "vitest";
import { activeDatesFrom, countCompletionsByDay, heatLevel, peakCount } from "@/lib/gamification/dailyActivity";

describe("countCompletionsByDay", () => {
  it("is empty for no completions", () => {
    expect(countCompletionsByDay([], [])).toEqual({});
  });

  it("counts a task completion on its day", () => {
    expect(countCompletionsByDay([{ completedDate: "2026-09-06" }], [])).toEqual({ "2026-09-06": 1 });
  });

  it("counts a habit completion on its day", () => {
    expect(countCompletionsByDay([], [{ completedDate: "2026-09-06" }])).toEqual({ "2026-09-06": 1 });
  });

  it("combines tasks and habits on the same day", () => {
    const counts = countCompletionsByDay(
      [{ completedDate: "2026-09-06" }, { completedDate: "2026-09-06" }],
      [{ completedDate: "2026-09-06" }]
    );
    expect(counts).toEqual({ "2026-09-06": 3 });
  });

  it("omits empty days rather than writing zeros", () => {
    const counts = countCompletionsByDay([{ completedDate: "2026-09-06" }], []);
    expect(Object.keys(counts)).toEqual(["2026-09-06"]);
    expect(counts["2026-09-07"]).toBeUndefined();
  });
});

describe("activeDatesFrom", () => {
  it("is empty with no completions", () => {
    expect(activeDatesFrom([], [])).toEqual([]);
  });

  it("returns distinct days, ascending", () => {
    const dates = activeDatesFrom(
      [{ completedDate: "2026-09-08" }, { completedDate: "2026-09-06" }],
      [{ completedDate: "2026-09-06" }, { completedDate: "2026-09-07" }]
    );
    expect(dates).toEqual(["2026-09-06", "2026-09-07", "2026-09-08"]);
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

describe("heatLevel", () => {
  it("is 0 for no activity", () => {
    expect(heatLevel(0, 10)).toBe(0);
  });

  it("is 0 when there is no peak yet", () => {
    expect(heatLevel(0, 0)).toBe(0);
  });

  it("scales relative to the peak, capped at HEAT_STEPS", () => {
    expect(heatLevel(1, 4)).toBe(1);
    expect(heatLevel(2, 4)).toBe(2);
    expect(heatLevel(3, 4)).toBe(3);
    expect(heatLevel(4, 4)).toBe(4);
  });

  it("never exceeds the top band even above the peak", () => {
    expect(heatLevel(9, 4)).toBe(4);
  });
});
