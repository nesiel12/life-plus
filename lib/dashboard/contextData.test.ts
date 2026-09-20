import { describe, expect, it } from "vitest";
import {
  bedtimeInfo,
  durationLabel,
  localDateKey,
  pickTopGoals,
  tomorrowOutlook,
} from "@/lib/dashboard/contextData";
import type { Goal, ManualEvent, Task } from "@/types";
import type { WeekCalendarEvent } from "@/lib/time/buildDailyTimeline";

const at = (h: number, m = 0, day = 20) => new Date(2026, 8, day, h, m, 0);

function goal(id: string, milestones: { done: boolean; dueDate?: string }[], overrides: Partial<Goal> = {}): Goal {
  return {
    id,
    title: `יעד ${id}`,
    category: "knowledge",
    createdAt: "2026-08-01T00:00:00Z",
    milestones: milestones.map((m, i) => ({ id: `${id}-m${i}`, title: `צעד ${i + 1} ב-${id}`, ...m })),
    ...overrides,
  };
}

describe("localDateKey", () => {
  it("uses the local calendar day, zero-padded", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 11, 31, 0, 0))).toBe("2026-12-31");
  });
});

describe("pickTopGoals", () => {
  it("skips finished goals and goals with no milestones", () => {
    const result = pickTopGoals([goal("done", [{ done: true }]), goal("empty", []), goal("open", [{ done: false }])]);
    expect(result.map((r) => r.goal.id)).toEqual(["open"]);
  });

  it("names the earliest open milestone as the next step", () => {
    const [top] = pickTopGoals([
      goal("g", [{ done: true }, { done: false, dueDate: "2026-10-05" }, { done: false, dueDate: "2026-09-25" }]),
    ]);
    expect(top.next.dueDate).toBe("2026-09-25");
    expect(top.remaining).toBe(2);
  });

  it("ranks by how soon the next step is due, dated before undated", () => {
    const result = pickTopGoals([
      goal("undated", [{ done: false }]),
      goal("later", [{ done: false, dueDate: "2026-11-01" }]),
      goal("soon", [{ done: false, dueDate: "2026-09-22" }]),
    ]);
    expect(result.map((r) => r.goal.id)).toEqual(["soon", "later", "undated"]);
  });

  it("breaks ties by the goal's own target date, then by age", () => {
    const result = pickTopGoals([
      goal("young", [{ done: false }], { createdAt: "2026-09-01T00:00:00Z" }),
      goal("old", [{ done: false }], { createdAt: "2026-01-01T00:00:00Z" }),
      goal("targeted", [{ done: false }], { targetDate: "2026-12-01" }),
    ]);
    expect(result.map((r) => r.goal.id)).toEqual(["targeted", "old", "young"]);
  });

  it("returns at most three, and does not mutate its input", () => {
    const goals = ["a", "b", "c", "d", "e"].map((id) => goal(id, [{ done: false }]));
    const copy = JSON.stringify(goals);
    expect(pickTopGoals(goals)).toHaveLength(3);
    expect(pickTopGoals(goals, 2)).toHaveLength(2);
    expect(JSON.stringify(goals)).toBe(copy);
  });
});

describe("bedtimeInfo", () => {
  it("counts down to the sleep time the person gave", () => {
    expect(bedtimeInfo(at(22, 15), "23:00", "07:00")).toEqual({
      pastBedtime: false,
      minutesUntil: 45,
      sleepLabel: "23:00",
    });
    expect(bedtimeInfo(at(19, 0), "23:30").minutesUntil).toBe(270);
  });

  it("falls back to the energy model's defaults", () => {
    expect(bedtimeInfo(at(22, 0)).minutesUntil).toBe(60);
    expect(bedtimeInfo(at(22, 0)).sleepLabel).toBe("23:00");
  });

  it("says bedtime has passed inside the sleep window, wrapping midnight", () => {
    for (const [h, m] of [[23, 0], [23, 45], [0, 30], [3, 0], [6, 59]]) {
      const info = bedtimeInfo(at(h, m), "23:00", "07:00");
      expect(info.pastBedtime, `${h}:${m}`).toBe(true);
      expect(info.minutesUntil).toBeNull();
    }
    expect(bedtimeInfo(at(7, 0), "23:00", "07:00").pastBedtime).toBe(false);
  });

  it("handles a night owl whose sleep time is after midnight", () => {
    // Sleeps 01:30, wakes 09:30: 23:00 is still an evening with 2.5h to go.
    expect(bedtimeInfo(at(23, 0), "01:30", "09:30")).toMatchObject({ pastBedtime: false, minutesUntil: 150 });
    expect(bedtimeInfo(at(2, 0), "01:30", "09:30").pastBedtime).toBe(true);
  });

  it("ignores an unreadable time rather than breaking", () => {
    expect(bedtimeInfo(at(22, 0), "late", "soon").sleepLabel).toBe("23:00");
  });
});

describe("durationLabel", () => {
  it.each([
    [0, "0 דקות"],
    [45, "45 דקות"],
    [60, "שעה"],
    [80, "שעה ו-20 דקות"],
    [180, "3 שעות"],
    [200, "3 שעות ו-20 דקות"],
  ])("%d minutes → %s", (minutes, expected) => {
    expect(durationLabel(minutes)).toBe(expected);
  });
});

describe("tomorrowOutlook", () => {
  const now = at(22, 30); // 2026-09-20
  const base = { now, transactions: [], meals: [], workouts: [] };
  const event = (id: string, start: string, allDay = false): WeekCalendarEvent => ({
    id,
    title: `אירוע ${id}`,
    start_time: start,
    end_time: start,
    is_all_day: allDay,
  });
  const task = (id: string, dueDate?: string, status: Task["status"] = "todo"): Task => ({
    id,
    title: `משימה ${id}`,
    status,
    dueDate,
    isHighPriority: false,
    createdAt: "2026-09-01T00:00:00Z",
  });

  it("looks at tomorrow's date, not today's", () => {
    const result = tomorrowOutlook({ ...base, events: [], tasks: [], manualEvents: [] });
    expect(result.dateKey).toBe("2026-09-21");
    expect(result.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it("rolls over the end of a month", () => {
    expect(tomorrowOutlook({ ...base, now: at(23, 0, 30), events: [], tasks: [], manualEvents: [] }).dateKey).toBe(
      "2026-10-01"
    );
  });

  it("lists tomorrow's events, timed ones first, capped at three", () => {
    const result = tomorrowOutlook({
      ...base,
      events: [
        event("late", new Date(2026, 8, 21, 16, 0).toISOString()),
        event("early", new Date(2026, 8, 21, 8, 30).toISOString()),
        event("today", new Date(2026, 8, 20, 9, 0).toISOString()),
        event("mid", new Date(2026, 8, 21, 12, 0).toISOString()),
        event("extra", new Date(2026, 8, 21, 18, 0).toISOString()),
      ],
      tasks: [],
      manualEvents: [],
    });
    expect(result.count).toBe(4); // 'today' is not tomorrow
    expect(result.items.map((i) => i.title)).toEqual(["אירוע early", "אירוע mid", "אירוע late"]);
    expect(result.items[0].time).toBeTruthy();
  });

  it("counts open tasks due tomorrow, and only those", () => {
    const result = tomorrowOutlook({
      ...base,
      events: [],
      manualEvents: [] as ManualEvent[],
      tasks: [
        task("due", "2026-09-21T10:00:00"),
        task("done", "2026-09-21T10:00:00", "done"),
        task("today", "2026-09-20T10:00:00"),
        task("none"),
      ],
    });
    expect(result.tasksDue).toBe(1);
  });
});
