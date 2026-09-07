import { describe, expect, it } from "vitest";
import { rankSchedulable, suggestSlots, type SchedulableTask } from "@/lib/schedule/slotSuggestions";
import type { RoutineBlock } from "@/lib/schedule/routine";

const AT = new Date("2026-09-15T09:00:00Z");
const TODAY = "2026-09-15";

function task(overrides: Partial<SchedulableTask> & { id: string }): SchedulableTask {
  return { title: `Task ${overrides.id}`, isHighPriority: false, status: "todo", ...overrides };
}

function block(overrides: Partial<RoutineBlock> & { id: string }): RoutineBlock {
  return {
    title: "בלוק",
    kind: "work",
    weekdays: [2],
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    isActive: true,
    ...overrides,
  };
}

describe("rankSchedulable", () => {
  it("ignores tasks that are neither due nor flagged", () => {
    // A task with no due date and no priority is one the user chose not to
    // schedule — pushing it at 3pm is the app inventing urgency.
    expect(rankSchedulable([task({ id: "1" })], AT, TODAY)).toEqual([]);
  });

  it("ignores completed tasks", () => {
    expect(
      rankSchedulable([task({ id: "1", isHighPriority: true, status: "done" })], AT, TODAY)
    ).toEqual([]);
  });

  it("includes overdue, due-today and flagged tasks", () => {
    const tasks = [
      task({ id: "overdue", dueDate: "2026-09-10T09:00:00Z" }),
      task({ id: "today", dueDate: "2026-09-15T18:00:00Z" }),
      task({ id: "flagged", isHighPriority: true }),
      task({ id: "someday" }),
    ];
    expect(rankSchedulable(tasks, AT, TODAY).map((t) => t.id)).toEqual([
      "overdue",
      "today",
      "flagged",
    ]);
  });

  it("puts the older due date first within a tier", () => {
    const tasks = [
      task({ id: "recent", dueDate: "2026-09-14T09:00:00Z" }),
      task({ id: "ancient", dueDate: "2026-09-01T09:00:00Z" }),
    ];
    expect(rankSchedulable(tasks, AT, TODAY).map((t) => t.id)).toEqual(["ancient", "recent"]);
  });
});

describe("suggestSlots", () => {
  const blocks = [block({ id: "work", startMinute: 9 * 60, endMinute: 12 * 60 })];

  it("says nothing when there is nothing pressing", () => {
    expect(
      suggestSlots([task({ id: "1" })], blocks, {
        at: AT,
        weekday: 2,
        nowMinute: 12 * 60,
        todayKey: TODAY,
      })
    ).toEqual([]);
  });

  it("says nothing when the day has no room left", () => {
    const packed = [block({ id: "all-day", startMinute: 0, endMinute: 1440 })];
    expect(
      suggestSlots([task({ id: "1", isHighPriority: true })], packed, {
        at: AT,
        weekday: 2,
        nowMinute: 9 * 60,
        todayKey: TODAY,
      })
    ).toEqual([]);
  });

  it("proposes the next free window for a pressing task", () => {
    const suggestions = suggestSlots([task({ id: "1", isHighPriority: true })], blocks, {
      at: AT,
      weekday: 2,
      nowMinute: 9 * 60,
      todayKey: TODAY,
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].startMinute).toBe(12 * 60);
  });

  it("prefers a window inside the user's peak hours", () => {
    const twoWindows = [
      block({ id: "morning", startMinute: 9 * 60, endMinute: 10 * 60 }),
      block({ id: "midday", startMinute: 12 * 60, endMinute: 16 * 60 }),
    ];
    const suggestions = suggestSlots([task({ id: "1", isHighPriority: true })], twoWindows, {
      at: AT,
      weekday: 2,
      nowMinute: 9 * 60,
      todayKey: TODAY,
      peakHours: [16],
    });
    // 10:00-12:00 is free and earlier, but 16:00 is when they focus.
    expect(suggestions[0].startMinute).toBe(16 * 60);
    expect(suggestions[0].reason).toContain("מיקוד");
  });

  it("rounds the start up to a sensible clock time", () => {
    const suggestions = suggestSlots([task({ id: "1", isHighPriority: true })], [], {
      at: AT,
      weekday: 2,
      nowMinute: 14 * 60 + 7,
      todayKey: TODAY,
    });
    // 14:07 is accurate and useless; 14:15 is a time someone starts at.
    expect(suggestions[0].startMinute).toBe(14 * 60 + 15);
  });

  it("caps a proposed block rather than filling an entire empty evening", () => {
    const suggestions = suggestSlots([task({ id: "1", isHighPriority: true })], [], {
      at: AT,
      weekday: 2,
      nowMinute: 14 * 60,
      todayKey: TODAY,
    });
    expect(suggestions[0].endMinute - suggestions[0].startMinute).toBe(90);
  });

  it("gives two tasks different slots", () => {
    const tasks = [
      task({ id: "a", isHighPriority: true }),
      task({ id: "b", dueDate: "2026-09-01T09:00:00Z" }),
    ];
    const suggestions = suggestSlots(tasks, [], {
      at: AT,
      weekday: 2,
      nowMinute: 14 * 60,
      todayKey: TODAY,
    });
    expect(suggestions).toHaveLength(2);
    expect(suggestions[0].startMinute).not.toBe(suggestions[1].startMinute);
    // The second starts where the first ends.
    expect(suggestions[1].startMinute).toBe(suggestions[0].endMinute);
  });

  it("respects the limit", () => {
    const tasks = [
      task({ id: "a", isHighPriority: true }),
      task({ id: "b", isHighPriority: true }),
      task({ id: "c", isHighPriority: true }),
    ];
    expect(
      suggestSlots(tasks, [], { at: AT, weekday: 2, nowMinute: 13 * 60, todayKey: TODAY, limit: 1 })
    ).toHaveLength(1);
  });

  it("does not propose work past the end of the day", () => {
    const suggestions = suggestSlots([task({ id: "1", isHighPriority: true })], [], {
      at: AT,
      weekday: 2,
      nowMinute: 21 * 60 + 45,
      todayKey: TODAY,
      endOfDayHour: 22,
    });
    expect(suggestions).toEqual([]);
  });
});
