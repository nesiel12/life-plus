import { describe, expect, it } from "vitest";
import { findFocusSlots, hasConflict, mergeIntervals } from "@/lib/calendar/findFocusSlots";
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
