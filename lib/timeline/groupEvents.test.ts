import { describe, expect, it } from "vitest";
import { groupEventsByDate } from "@/lib/timeline/groupEvents";
import type { TimelineEvent } from "@/lib/timeline/types";

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function event(patch: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "e1",
    kind: "moment",
    timestamp: daysAgoISO(0),
    category: "general",
    title: "Event",
    achievement: false,
    ...patch,
  };
}

describe("groupEventsByDate", () => {
  it("returns nothing for no events", () => {
    expect(groupEventsByDate([])).toEqual([]);
  });

  it('labels a same-day event "היום"', () => {
    const groups = groupEventsByDate([event({ timestamp: daysAgoISO(0) })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("היום");
  });

  it('labels yesterday\'s event "אתמול"', () => {
    const groups = groupEventsByDate([event({ timestamp: daysAgoISO(1) })]);
    expect(groups[0].label).toBe("אתמול");
  });

  it("labels an event 2-6 days back with its weekday name", () => {
    const timestamp = daysAgoISO(3);
    const groups = groupEventsByDate([event({ timestamp })]);
    expect(groups[0].label).toBe(new Date(timestamp).toLocaleDateString("he-IL", { weekday: "long" }));
  });

  it("labels an older event with a full, year-qualified date", () => {
    const timestamp = daysAgoISO(40);
    const groups = groupEventsByDate([event({ timestamp })]);
    expect(groups[0].label).toBe(
      new Date(timestamp).toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })
    );
  });

  it("groups consecutive same-day events under one header", () => {
    const groups = groupEventsByDate([
      event({ id: "a", timestamp: daysAgoISO(0) }),
      event({ id: "b", timestamp: daysAgoISO(0) }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("starts a new group when the day changes, preserving overall order", () => {
    const groups = groupEventsByDate([
      event({ id: "today", timestamp: daysAgoISO(0) }),
      event({ id: "yesterday", timestamp: daysAgoISO(1) }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe("היום");
    expect(groups[1].label).toBe("אתמול");
  });
});
