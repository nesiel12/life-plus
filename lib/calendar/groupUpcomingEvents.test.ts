import { describe, expect, it } from "vitest";
import { groupUpcomingEvents } from "@/lib/calendar/groupUpcomingEvents";
import type { GoogleCalendarEvent } from "@/lib/googleCalendar/fetchEvents";

function event(id: string, start: string): GoogleCalendarEvent {
  return { id, title: `Event ${id}`, start, end: start };
}

describe("groupUpcomingEvents", () => {
  it("returns nothing for an empty list", () => {
    const now = new Date("2026-07-15T08:00:00Z"); // 11:00 local (summer, UTC+3)
    expect(groupUpcomingEvents([], now)).toEqual([]);
  });

  it("buckets today, tomorrow, and later events separately, in fixed order", () => {
    const now = new Date("2026-07-15T08:00:00Z"); // today = 2026-07-15 local
    const events = [
      event("later", "2026-07-20T10:00:00Z"),
      event("today", "2026-07-15T12:00:00Z"),
      event("tomorrow", "2026-07-16T09:00:00Z"),
    ];
    const groups = groupUpcomingEvents(events, now);
    expect(groups.map((g) => g.label)).toEqual(["היום", "מחר", "בקרוב"]);
    expect(groups[0].events.map((e) => e.id)).toEqual(["today"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["tomorrow"]);
    expect(groups[2].events.map((e) => e.id)).toEqual(["later"]);
  });

  it("omits a group entirely when it has no events, rather than an empty section", () => {
    const now = new Date("2026-07-15T08:00:00Z");
    const groups = groupUpcomingEvents([event("later", "2026-07-25T10:00:00Z")], now);
    expect(groups.map((g) => g.label)).toEqual(["בקרוב"]);
  });

  it("preserves the existing start-time order within a single bucket", () => {
    const now = new Date("2026-07-15T08:00:00Z");
    const events = [event("second", "2026-07-15T14:00:00Z"), event("first", "2026-07-15T09:00:00Z")];
    const groups = groupUpcomingEvents(events, now);
    expect(groups[0].events.map((e) => e.id)).toEqual(["second", "first"]);
  });
});
