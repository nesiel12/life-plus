import { describe, expect, it } from "vitest";
import { resolveGapActivity, type GapTaskCandidate } from "@/lib/calendar/gapActivity";
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

  it("labels a gap as free time with no blocks and no pressing tasks", () => {
    const result = resolveGapActivity(gap(600, 720), {
      blocks: [],
      weekday: 4,
      tasks: [],
      todayKey,
    });
    expect(result).toEqual({ label: "זמן פנוי" });
  });

  it("uses a covering rest block and never attaches a task to protected time", () => {
    const overdue: GapTaskCandidate = { id: "t1", title: "x", status: "todo", dueDate: "2026-01-10" };
    const result = resolveGapActivity(gap(600, 720), {
      blocks: [block({ kind: "rest", startMinute: 540, endMinute: 780, title: "מנוחת צהריים" })],
      weekday: 4,
      tasks: [overdue],
      todayKey,
    });
    expect(result.label).toBe("מנוחת צהריים");
    expect(result.task).toBeUndefined();
  });

  it("suggests the most pressing task that fits an open gap", () => {
    const tasks: GapTaskCandidate[] = [
      { id: "low", title: "someday", status: "todo" },
      { id: "today", title: "call bank", status: "todo", dueDate: "2026-01-15" },
      { id: "overdue", title: "file form", status: "todo", dueDate: "2026-01-09" },
    ];
    const result = resolveGapActivity(gap(600, 720), { blocks: [], weekday: 4, tasks, todayKey });
    expect(result.task?.id).toBe("overdue");
  });

  it("does not suggest a task for a gap under 30 minutes", () => {
    const tasks: GapTaskCandidate[] = [
      { id: "overdue", title: "file form", status: "todo", dueDate: "2026-01-09" },
    ];
    const result = resolveGapActivity(gap(600, 625), { blocks: [], weekday: 4, tasks, todayKey });
    expect(result.task).toBeUndefined();
  });

  it("ignores non-pressing tasks entirely", () => {
    const tasks: GapTaskCandidate[] = [{ id: "low", title: "someday", status: "todo" }];
    const result = resolveGapActivity(gap(600, 800), { blocks: [], weekday: 4, tasks, todayKey });
    expect(result.task).toBeUndefined();
  });
});
