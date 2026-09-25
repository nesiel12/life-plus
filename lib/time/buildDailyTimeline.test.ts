import { describe, expect, it, vi } from "vitest";
import { buildDailyTimelineRows, type WeekCalendarEvent } from "./buildDailyTimeline";
import type { Task } from "@/types";

const DATE = "2026-09-25";

function event(overrides: Partial<WeekCalendarEvent> = {}): WeekCalendarEvent {
  return {
    id: "9i564c61",
    title: "פגישת צוות",
    start_time: `${DATE}T10:00:00.000Z`,
    end_time: `${DATE}T11:00:00.000Z`,
    is_all_day: false,
    calendar_id: "primary",
    ...overrides,
  };
}

describe("buildDailyTimelineRows", () => {
  // The exact 2026-09-25 incident: fetchAllCalendarsWindow deliberately
  // keeps the SAME Google event id on two calendars as two distinct rows
  // (an invite the user also owns, or a shared family calendar) — before
  // calendar_id was threaded into each row's id, this produced two rows
  // with the identical React key, crashing TodayStructureCard/
  // TodayTimelineCard with "Encountered two children with the same key".
  it("gives two calendars' copies of the same event id genuinely distinct row ids", () => {
    const events = [event({ calendar_id: "primary" }), event({ calendar_id: "family@group.calendar.google.com" })];
    const rows = buildDailyTimelineRows(DATE, events, [], [], [], [], [], true);

    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(rows).toHaveLength(2);
  });

  it("still produces one row per event in the ordinary, single-calendar case", () => {
    const rows = buildDailyTimelineRows(DATE, [event()], [], [], [], [], [], true);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("event-primary-9i564c61");
  });

  it("keeps task/manual-event/shift/meal/workout row ids unaffected by the event id change", () => {
    const task: Task = {
      id: "t1",
      title: "משימה",
      status: "todo",
      dueDate: `${DATE}T08:00:00.000Z`,
    } as Task;
    const rows = buildDailyTimelineRows(DATE, [], [task], [], [], [], [], true);
    expect(rows[0].id).toBe("task-t1");
  });

  it("defensively drops a genuine duplicate id, keeping the first occurrence, and warns", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const events = [event({ calendar_id: "primary" }), event({ calendar_id: "primary" })]; // identical on every field, including calendar_id
    const rows = buildDailyTimelineRows(DATE, events, [], [], [], [], [], true);

    expect(rows).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("event-primary-9i564c61"));
    spy.mockRestore();
  });
});
