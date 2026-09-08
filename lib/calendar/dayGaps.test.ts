import { describe, expect, it } from "vitest";
import { findDayGaps } from "@/lib/calendar/dayGaps";

// Build an ISO instant at HH:MM local on a fixed date. The helper only reads
// hours/minutes, so the date is arbitrary.
function at(hour: number, minute = 0): string {
  const d = new Date(2026, 0, 15, hour, minute, 0, 0);
  return d.toISOString();
}

describe("findDayGaps", () => {
  it("returns the whole window when there are no events", () => {
    const gaps = findDayGaps([], { fromMinute: 7 * 60, toMinute: 23 * 60 });
    expect(gaps).toEqual([{ startMinute: 420, endMinute: 1380, durationMinutes: 960 }]);
  });

  it("finds the hole between two events", () => {
    const gaps = findDayGaps(
      [
        { start: at(9), end: at(10) },
        { start: at(13), end: at(14) },
      ],
      { fromMinute: 8 * 60, toMinute: 18 * 60, minDurationMinutes: 45 }
    );
    expect(gaps).toEqual([
      { startMinute: 480, endMinute: 540, durationMinutes: 60 }, // 08:00–09:00
      { startMinute: 600, endMinute: 780, durationMinutes: 180 }, // 10:00–13:00
      { startMinute: 840, endMinute: 1080, durationMinutes: 240 }, // 14:00–18:00
    ]);
  });

  it("merges overlapping events so it never invents free time inside an overlap", () => {
    const gaps = findDayGaps(
      [
        { start: at(9), end: at(12) },
        { start: at(10), end: at(11) },
      ],
      { fromMinute: 9 * 60, toMinute: 13 * 60, minDurationMinutes: 30 }
    );
    expect(gaps).toEqual([{ startMinute: 720, endMinute: 780, durationMinutes: 60 }]); // only 12:00–13:00
  });

  it("drops gaps shorter than the minimum", () => {
    const gaps = findDayGaps(
      [
        { start: at(9), end: at(10) },
        { start: at(10, 30), end: at(12) },
      ],
      { fromMinute: 9 * 60, toMinute: 12 * 60, minDurationMinutes: 45 }
    );
    expect(gaps).toEqual([]); // the 10:00–10:30 hole is only 30 min
  });

  it("trims a gap that straddles nowMinute and drops fully-past ones", () => {
    const gaps = findDayGaps(
      [
        { start: at(9), end: at(10) },
        { start: at(15), end: at(16) },
      ],
      { fromMinute: 7 * 60, toMinute: 20 * 60, nowMinute: 13 * 60, minDurationMinutes: 45 }
    );
    expect(gaps).toEqual([
      { startMinute: 780, endMinute: 900, durationMinutes: 120 }, // 13:00–15:00, trimmed to now
      { startMinute: 960, endMinute: 1200, durationMinutes: 240 }, // 16:00–20:00
    ]);
  });
});
