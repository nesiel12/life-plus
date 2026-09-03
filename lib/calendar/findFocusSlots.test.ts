import { describe, expect, it } from "vitest";
import { findFocusSlots, findFocusSlotsAcrossDays, hasConflict, mergeIntervals } from "@/lib/calendar/findFocusSlots";
import type { ChronotypeSettings } from "@/types";

// Local-time helper: the scheduler works in the user's own day, so tests must
// build instants the same way rather than hardcoding UTC strings.
function at(hour: number, minute = 0): string {
  const d = new Date(2026, 8, 15, hour, minute, 0, 0); // 2026-09-15, local
  return d.toISOString();
}
const DAY = new Date(2026, 8, 15, 12, 0, 0, 0);

const chronotype: ChronotypeSettings = {
  wakeTime: "06:30",
  sleepTime: "23:00",
  peakFocusHours: ["morning"], // 08:00-12:00
  lowEnergyHours: ["afternoon"], // 12:00-16:00
};

describe("mergeIntervals", () => {
  it("merges overlapping and touching intervals", () => {
    const merged = mergeIntervals([
      { start: at(9), end: at(10) },
      { start: at(9, 30), end: at(11) },
      { start: at(11), end: at(12) },
    ]);
    expect(merged).toHaveLength(1);
    expect(new Date(merged[0].start).getHours()).toBe(9);
    expect(new Date(merged[0].end).getHours()).toBe(12);
  });

  it("drops zero-length and inverted intervals", () => {
    expect(mergeIntervals([{ start: at(9), end: at(9) }])).toHaveLength(0);
    expect(mergeIntervals([{ start: at(10), end: at(9) }])).toHaveLength(0);
  });

  it("keeps disjoint intervals separate and sorted", () => {
    const merged = mergeIntervals([
      { start: at(14), end: at(15) },
      { start: at(9), end: at(10) },
    ]);
    expect(merged).toHaveLength(2);
    expect(new Date(merged[0].start).getHours()).toBe(9);
  });
});

describe("findFocusSlots", () => {
  it("ranks peak-energy windows above longer neutral ones", () => {
    const slots = findFocusSlots({ day: DAY, busy: [], chronotype });
    expect(slots[0].energy).toBe("peak");
    expect(new Date(slots[0].start).getHours()).toBe(8);
  });

  it("never proposes low-energy hours", () => {
    const slots = findFocusSlots({ day: DAY, busy: [], chronotype, maxResults: 20 });
    for (const slot of slots) {
      const hour = new Date(slot.start).getHours();
      expect(hour < 12 || hour >= 16).toBe(true);
    }
  });

  it("never proposes hours the user is asleep for", () => {
    const slots = findFocusSlots({ day: DAY, busy: [], chronotype, maxResults: 20 });
    for (const slot of slots) {
      const hour = new Date(slot.start).getHours();
      expect(hour).toBeGreaterThanOrEqual(6);
      expect(hour).toBeLessThan(23);
    }
  });

  it("excludes busy time and splits the surrounding free run", () => {
    const slots = findFocusSlots({
      day: DAY,
      busy: [{ start: at(9), end: at(10) }],
      chronotype,
      maxResults: 20,
    });
    const peak = slots.filter((s) => s.energy === "peak");
    // 08:00-09:00 and 10:00-12:00 survive; nothing may overlap the meeting.
    expect(peak.length).toBeGreaterThanOrEqual(2);
    for (const slot of slots) {
      expect(hasConflict(slot.start, slot.end, [{ start: at(9), end: at(10) }])).toBe(false);
    }
  });

  it("honours notBefore so today's past is never proposed", () => {
    const slots = findFocusSlots({
      day: DAY,
      busy: [],
      chronotype,
      notBefore: new Date(2026, 8, 15, 17, 0, 0, 0),
      maxResults: 20,
    });
    for (const slot of slots) {
      expect(new Date(slot.end).getTime()).toBeGreaterThan(
        new Date(2026, 8, 15, 17, 0, 0, 0).getTime()
      );
    }
  });

  it("drops slots shorter than the minimum", () => {
    // Leave only 08:00-08:30 free within the peak window.
    const slots = findFocusSlots({
      day: DAY,
      busy: [{ start: at(8, 30), end: at(12) }],
      chronotype,
      minDurationMinutes: 60,
      maxResults: 20,
    });
    expect(slots.every((s) => s.durationMinutes >= 60)).toBe(true);
    expect(slots.some((s) => new Date(s.start).getHours() === 8)).toBe(false);
  });

  it("returns nothing when the day is fully booked", () => {
    const slots = findFocusSlots({
      day: DAY,
      busy: [{ start: at(0), end: at(23, 59) }],
      chronotype,
    });
    expect(slots).toEqual([]);
  });

  it("treats an empty chronotype as all-neutral rather than failing", () => {
    const slots = findFocusSlots({ day: DAY, busy: [], chronotype: {} });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => s.energy === "neutral")).toBe(true);
  });
});

describe("hasConflict", () => {
  const busy = [{ start: at(9), end: at(10) }];

  it("detects any overlap", () => {
    expect(hasConflict(at(9, 30), at(10, 30), busy)).toBe(true);
    expect(hasConflict(at(8, 30), at(9, 30), busy)).toBe(true);
    expect(hasConflict(at(8), at(11), busy)).toBe(true);
  });

  it("treats abutting intervals as free", () => {
    expect(hasConflict(at(10), at(11), busy)).toBe(false);
    expect(hasConflict(at(8), at(9), busy)).toBe(false);
  });
});

// 2026-09-15 + offset days, local time — matches DAY/`at()` above.
function dayPlus(offset: number, hour = 12): Date {
  return new Date(2026, 8, 15 + offset, hour, 0, 0, 0);
}
function atOffset(offset: number, hour: number, minute = 0): string {
  return new Date(2026, 8, 15 + offset, hour, minute, 0, 0).toISOString();
}

describe("findFocusSlotsAcrossDays", () => {
  it("finds slots on a later day when today is fully booked", () => {
    const slots = findFocusSlotsAcrossDays({
      from: dayPlus(0),
      until: dayPlus(2),
      busy: [{ start: atOffset(0, 0), end: atOffset(0, 23, 59) }],
      chronotype,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s) => new Date(s.start).getTime() >= atOffsetTime(1, 0))).toBe(true);
  });

  it("ranks peak slots across the whole range, not just day one", () => {
    // Day 0 has only a neutral morning gap (peak hours booked); day 1 is
    // wide open, so its peak window should win overall.
    const slots = findFocusSlotsAcrossDays({
      from: dayPlus(0),
      until: dayPlus(1),
      busy: [{ start: atOffset(0, 8), end: atOffset(0, 12) }],
      chronotype,
      maxResults: 10,
    });
    expect(slots[0].energy).toBe("peak");
    expect(new Date(slots[0].start).getDate()).toBe(16);
  });

  it("respects `from` as a same-day floor but not on later days", () => {
    const slots = findFocusSlotsAcrossDays({
      from: dayPlus(0, 10), // "now" is 10:00 on day 0
      until: dayPlus(1),
      busy: [],
      chronotype,
      maxResults: 50,
    });
    const day0Starts = slots.filter((s) => new Date(s.start).getDate() === 15).map((s) => new Date(s.start).getHours());
    expect(day0Starts.every((h) => h >= 10)).toBe(true);
    const day1Starts = slots.filter((s) => new Date(s.start).getDate() === 16).map((s) => new Date(s.start).getHours());
    expect(day1Starts.some((h) => h < 10)).toBe(true);
  });

  it("returns nothing when `until` precedes `from` (an overdue task)", () => {
    const slots = findFocusSlotsAcrossDays({ from: dayPlus(2), until: dayPlus(0), busy: [], chronotype });
    expect(slots).toEqual([]);
  });

  it("treats `from` and `until` on the same day as a single-day search", () => {
    const slots = findFocusSlotsAcrossDays({ from: dayPlus(0), until: dayPlus(0), busy: [], chronotype });
    expect(slots.every((s) => new Date(s.start).getDate() === 15)).toBe(true);
  });

  it("caps results at maxResults across the merged range", () => {
    const slots = findFocusSlotsAcrossDays({
      from: dayPlus(0),
      until: dayPlus(5),
      busy: [],
      chronotype,
      maxResults: 3,
    });
    expect(slots.length).toBeLessThanOrEqual(3);
  });
});

function atOffsetTime(offset: number, hour: number): number {
  return new Date(2026, 8, 15 + offset, hour, 0, 0, 0).getTime();
}
