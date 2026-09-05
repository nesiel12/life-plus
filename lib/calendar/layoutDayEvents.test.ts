import { describe, expect, it } from "vitest";
import { layoutDayEvents, minutesIntoDay, type TimeSpan } from "@/lib/calendar/layoutDayEvents";

interface Ev extends TimeSpan {
  id: string;
}

const ev = (id: string, startMinute: number, endMinute: number): Ev => ({ id, startMinute, endMinute });
const span = (e: Ev): TimeSpan => e;

// A 06:00–24:00 grid, the same window the timeline renders.
const GRID_START = 6 * 60;
const GRID_END = 24 * 60;

function place(events: Ev[], from = GRID_START, to = GRID_END) {
  return layoutDayEvents(events, span, from, to);
}

describe("layoutDayEvents", () => {
  it("returns nothing for no events", () => {
    expect(place([])).toEqual([]);
  });

  it("returns nothing for a zero-width grid", () => {
    expect(place([ev("a", 600, 660)], 600, 600)).toEqual([]);
  });

  it("places a single event as a full-width column", () => {
    const [a] = place([ev("a", 12 * 60, 13 * 60)]);
    expect(a.columns).toBe(1);
    expect(a.column).toBe(0);
    // Noon is a third of the way through an 18-hour grid starting at 06:00.
    expect(a.top).toBeCloseTo(1 / 3, 5);
    expect(a.height).toBeCloseTo(1 / 18, 5);
  });

  describe("overlaps", () => {
    it("splits two overlapping events into two columns", () => {
      const out = place([ev("a", 600, 720), ev("b", 660, 780)]);
      expect(out.map((p) => p.columns)).toEqual([2, 2]);
      expect(out.map((p) => p.column).sort()).toEqual([0, 1]);
    });

    it("gives three mutually-overlapping events three columns", () => {
      const out = place([ev("a", 600, 780), ev("b", 620, 700), ev("c", 640, 660)]);
      expect(out.every((p) => p.columns === 3)).toBe(true);
      expect(out.map((p) => p.column).sort()).toEqual([0, 1, 2]);
    });

    // Touching is not overlapping — splitting the width there wastes half the
    // column for two events that never share a minute.
    it("keeps back-to-back events in one full-width column", () => {
      const out = place([ev("a", 600, 660), ev("b", 660, 720)]);
      expect(out.every((p) => p.columns === 1)).toBe(true);
    });

    it("reuses a freed column rather than growing the cluster forever", () => {
      // a spans the whole cluster; b and c are sequential beside it.
      const out = place([ev("a", 600, 800), ev("b", 610, 650), ev("c", 660, 700)]);
      expect(out.every((p) => p.columns === 2)).toBe(true);
      const byId = new Map(out.map((p) => [(p.event as Ev).id, p.column]));
      expect(byId.get("b")).toBe(byId.get("c"));
    });

    it("starts a fresh cluster after a gap, so an unrelated event stays full width", () => {
      const out = place([ev("a", 600, 660), ev("b", 620, 680), ev("later", 900, 960)]);
      const later = out.find((p) => (p.event as Ev).id === "later");
      expect(later?.columns).toBe(1);
    });

    it("chains a cluster through a transitive overlap", () => {
      // a–b overlap, b–c overlap, a–c do not: all three are one cluster.
      const out = place([ev("a", 600, 660), ev("b", 640, 700), ev("c", 680, 740)]);
      expect(new Set(out.map((p) => p.columns))).toEqual(new Set([2]));
    });

    // The longer event should lead the cluster, not be pushed aside by a
    // short one starting at the same minute.
    it("gives the leading column to the longer of two events starting together", () => {
      const out = place([ev("short", 600, 620), ev("long", 600, 720)]);
      const long = out.find((p) => (p.event as Ev).id === "long");
      expect(long?.column).toBe(0);
    });
  });

  describe("clipping", () => {
    it("clips an event that started before the grid", () => {
      const [a] = place([ev("a", 0, 7 * 60)]);
      expect(a.top).toBe(0);
      expect(a.height).toBeCloseTo(1 / 18, 5);
    });

    it("clips an event running past the end of the grid", () => {
      const [a] = place([ev("a", 23 * 60, 26 * 60)]);
      expect(a.top + a.height).toBeCloseTo(1, 5);
    });

    it("drops an event entirely before the grid", () => {
      expect(place([ev("a", 0, 5 * 60)])).toEqual([]);
    });

    it("drops an event entirely after the grid", () => {
      expect(place([ev("a", 25 * 60, 26 * 60)])).toEqual([]);
    });

    // An event ending exactly at the grid start touches nothing visible.
    it("drops an event ending exactly at the grid start", () => {
      expect(place([ev("a", 300, GRID_START)])).toEqual([]);
    });
  });

  describe("degenerate spans", () => {
    it("gives a zero-length event a clickable minimum height", () => {
      const [a] = place([ev("a", 600, 600)]);
      expect(a.height).toBeGreaterThan(0);
    });

    it("gives a very short event a clickable minimum height", () => {
      const [a] = place([ev("a", 600, 601)]);
      expect(a.height).toBeGreaterThanOrEqual(0.012);
    });

    it("treats an inverted span as instantaneous rather than negative", () => {
      const [a] = place([ev("a", 700, 600)]);
      expect(a.height).toBeGreaterThan(0);
      expect(a.top).toBeGreaterThanOrEqual(0);
    });
  });

  it("places every event it is given", () => {
    const events = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, 600 + i * 5, 660 + i * 5));
    expect(place(events)).toHaveLength(20);
  });

  it("does not mutate the input array", () => {
    const events = [ev("b", 700, 800), ev("a", 600, 660)];
    const order = events.map((e) => e.id);
    place(events);
    expect(events.map((e) => e.id)).toEqual(order);
  });
});

describe("minutesIntoDay", () => {
  it("counts from local midnight", () => {
    expect(minutesIntoDay(new Date(2026, 8, 6, 9, 30))).toBe(570);
    expect(minutesIntoDay(new Date(2026, 8, 6, 0, 0))).toBe(0);
    expect(minutesIntoDay(new Date(2026, 8, 6, 23, 59))).toBe(1439);
  });
});
