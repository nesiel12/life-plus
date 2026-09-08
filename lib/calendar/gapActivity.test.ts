import { describe, expect, it } from "vitest";
import { resolveGapActivity, pickGapTask, type GapTaskCandidate } from "@/lib/calendar/gapActivity";
import type { RoutineBlock } from "@/lib/schedule/routine";
import type { DayGap } from "@/lib/calendar/dayGaps";

const gap = (startMinute: number, endMinute: number): DayGap => ({
  startMinute,
  endMinute,
  durationMinutes: endMinute - startMinute,
});

function block(partial: Partial<RoutineBlock>): RoutineBlock {
  return {
    id: "b1",
    title: "",
    kind: "work",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startMinute: 0,
    endMinute: 1440,
    isActive: true,
    ...partial,
  };
}

describe("resolveGapActivity", () => {
  const todayKey = "2026-01-15";

  it("labels an ordinary gap as free time", () => {
    expect(resolveGapActivity(gap(600, 720), { blocks: [], weekday: 4, tasks: [], todayKey })).toEqual({
      label: "זמן פנוי",
    });
  });

  it("uses a covering rest block and never attaches a task to protected time", () => {
    const overdue: GapTaskCandidate = { id: "t1", title: "x", status: "todo", dueDate: "2026-01-10" };
    const result = resolveGapActivity(gap(600, 720), {
      blocks: [block({ kind: "rest", startMinute: 540, endMinute: 780, title: "מנוחת צהריים" })],
      weekday: 4,
      tasks: [overdue],
      todayKey,
    });
    expect(result).toEqual({ label: "מנוחת צהריים", accentVar: "--accent-time" });
  });

  it("labels a planned 'free' block but still allows a task in it", () => {
    const result = resolveGapActivity(gap(600, 720), {
      blocks: [block({ kind: "free", startMinute: 540, endMinute: 780 })],
      weekday: 4,
      tasks: [{ id: "t1", title: "call bank", status: "todo", dueDate: "2026-01-15" }],
      todayKey,
    });
    expect(result.label).toBe("זמן פנוי מתוכנן");
    expect(result.task?.id).toBe("t1");
  });
});

describe("pickGapTask", () => {
  const todayKey = "2026-01-15";

  it("prefers overdue, then due-today, then pinned", () => {
    const tasks: GapTaskCandidate[] = [
      { id: "pinned", title: "p", status: "todo", isHighPriority: true },
      { id: "today", title: "t", status: "todo", dueDate: "2026-01-15" },
      { id: "overdue", title: "o", status: "todo", dueDate: "2026-01-09" },
    ];
    expect(pickGapTask(tasks, 90, todayKey)?.id).toBe("overdue");
  });

  it("ignores non-pressing tasks and tiny gaps", () => {
    expect(pickGapTask([{ id: "x", title: "x", status: "todo" }], 90, todayKey)).toBeNull();
    expect(
      pickGapTask([{ id: "o", title: "o", status: "todo", dueDate: "2026-01-01" }], 20, todayKey)
    ).toBeNull();
  });
});
