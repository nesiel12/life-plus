import { describe, expect, it } from "vitest";
import { planBackboneSync } from "@/lib/calendar/backboneSync";
import type { RoutineBlock } from "@/lib/schedule/routine";

function block(p: Partial<RoutineBlock>): RoutineBlock {
  return {
    id: "b1",
    title: "עבודה",
    kind: "work",
    weekdays: [0, 1, 2, 3, 4],
    startMinute: 9 * 60,
    endMinute: 17 * 60,
    isActive: true,
    ...p,
  };
}

// A Wednesday.
const TODAY = new Date(2026, 8, 9);

describe("planBackboneSync", () => {
  it("single scope = one occurrence per block, no recurrence", () => {
    const plan = planBackboneSync({
      blocks: [block({ weekdays: [4] })], // Thursday
      today: TODAY,
      timeZone: "Asia/Jerusalem",
      scope: "single",
    });
    expect(plan.events).toHaveLength(1);
    expect(plan.events[0].recurrence).toBeUndefined();
    expect(plan.events[0].start.dateTime).toBe("2026-09-10T09:00:00"); // next Thursday
    expect(plan.events[0].start.timeZone).toBe("Asia/Jerusalem");
  });

  it("1-month scope = a weekly RRULE with the block's weekdays and an UNTIL", () => {
    const plan = planBackboneSync({
      blocks: [block({ weekdays: [0, 2, 4] })],
      today: TODAY,
      timeZone: "Asia/Jerusalem",
      scope: "1m",
    });
    expect(plan.events).toHaveLength(1);
    expect(plan.events[0].recurrence?.[0]).toMatch(/^RRULE:FREQ=WEEKLY;BYDAY=SU,TU,TH;UNTIL=\d{8}T235900Z$/);
  });

  it("skips a block whose only weekday never comes up in a 1-day window", () => {
    const plan = planBackboneSync({
      blocks: [block({ weekdays: [1], title: "מונדיי" })], // Monday, today is Wed
      today: TODAY,
      timeZone: "Asia/Jerusalem",
      scope: "1d",
    });
    expect(plan.events).toHaveLength(0);
    expect(plan.skipped).toEqual(["מונדיי"]);
  });

  it("ignores inactive blocks", () => {
    const plan = planBackboneSync({
      blocks: [block({ isActive: false })],
      today: TODAY,
      timeZone: "Asia/Jerusalem",
      scope: "1y",
    });
    expect(plan.events).toHaveLength(0);
  });
});
