import { describe, expect, it } from "vitest";
import {
  blocksForDay,
  bookedMinutes,
  currentBlock,
  formatDuration,
  formatMinute,
  freeWindows,
  nextBlock,
  nowNext,
  parseMinute,
  transitionsDue,
  type RoutineBlock,
} from "@/lib/schedule/routine";

function block(overrides: Partial<RoutineBlock> & Pick<RoutineBlock, "id">): RoutineBlock {
  return {
    title: "בלוק",
    kind: "work",
    weekdays: [0, 1, 2, 3, 4],
    startMinute: 9 * 60,
    endMinute: 13 * 60,
    isActive: true,
    ...overrides,
  };
}

describe("formatMinute", () => {
  it("pads to HH:MM", () => {
    expect(formatMinute(0)).toBe("00:00");
    expect(formatMinute(9 * 60 + 5)).toBe("09:05");
    expect(formatMinute(23 * 60 + 59)).toBe("23:59");
  });

  it("renders end-of-day as 24:00, not 00:00", () => {
    // A block running to midnight ends at the end of this day, not the start
    // of it — showing 00:00 would read as a zero-length block.
    expect(formatMinute(1440)).toBe("24:00");
  });
});

describe("parseMinute", () => {
  it("accepts padded and unpadded hours", () => {
    expect(parseMinute("09:30")).toBe(570);
    expect(parseMinute("9:30")).toBe(570);
    expect(parseMinute("24:00")).toBe(1440);
  });

  it("rejects nonsense rather than coercing it", () => {
    expect(parseMinute("")).toBeNull();
    expect(parseMinute("25:00")).toBeNull();
    expect(parseMinute("09:70")).toBeNull();
    expect(parseMinute("930")).toBeNull();
    expect(parseMinute("09:30 בבוקר")).toBeNull();
  });
});

describe("formatDuration", () => {
  it("reads naturally at each scale", () => {
    expect(formatDuration(45)).toBe("45 דק׳");
    expect(formatDuration(60)).toBe("שעה");
    expect(formatDuration(120)).toBe("2 שעות");
    expect(formatDuration(150)).toBe("2:30 שע׳");
  });
});

describe("blocksForDay", () => {
  it("keeps only active blocks on that weekday, in start order", () => {
    const blocks = [
      block({ id: "afternoon", startMinute: 14 * 60, endMinute: 16 * 60 }),
      block({ id: "morning", startMinute: 8 * 60, endMinute: 10 * 60 }),
      block({ id: "other-day", weekdays: [6] }),
      block({ id: "paused", isActive: false }),
    ];
    expect(blocksForDay(blocks, 1).map((b) => b.id)).toEqual(["morning", "afternoon"]);
  });
});

describe("currentBlock", () => {
  const blocks = [block({ id: "work", startMinute: 9 * 60, endMinute: 13 * 60 })];

  it("finds the block containing the moment", () => {
    expect(currentBlock(blocks, 1, 10 * 60)?.id).toBe("work");
  });

  it("includes the start minute and excludes the end minute", () => {
    // Half-open, so a block ending at 13:00 and one starting at 13:00 do not
    // both claim 13:00.
    expect(currentBlock(blocks, 1, 9 * 60)?.id).toBe("work");
    expect(currentBlock(blocks, 1, 13 * 60)).toBeNull();
  });

  it("returns null outside the block and on other days", () => {
    expect(currentBlock(blocks, 1, 8 * 60)).toBeNull();
    expect(currentBlock(blocks, 6, 10 * 60)).toBeNull();
  });

  it("prefers the most recently started block when two overlap", () => {
    const overlapping = [
      block({ id: "long", startMinute: 9 * 60, endMinute: 17 * 60 }),
      block({ id: "meeting", startMinute: 10 * 60, endMinute: 11 * 60 }),
    ];
    expect(currentBlock(overlapping, 1, 10 * 60 + 30)?.id).toBe("meeting");
  });
});

describe("nextBlock", () => {
  const blocks = [
    block({ id: "morning", startMinute: 9 * 60, endMinute: 13 * 60 }),
    block({ id: "evening", startMinute: 18 * 60, endMinute: 20 * 60 }),
  ];

  it("finds the next block later today", () => {
    const next = nextBlock(blocks, 1, 14 * 60, 2);
    expect(next?.block.id).toBe("evening");
    expect(next?.minutesUntil).toBe(4 * 60);
    expect(next?.isTomorrow).toBe(false);
  });

  it("rolls into tomorrow when today is finished", () => {
    const next = nextBlock(blocks, 1, 21 * 60, 2);
    expect(next?.block.id).toBe("morning");
    expect(next?.isTomorrow).toBe(true);
    // 3h left of today plus 9h into tomorrow.
    expect(next?.minutesUntil).toBe(3 * 60 + 9 * 60);
  });

  it("returns null when neither day has anything", () => {
    expect(nextBlock([], 1, 10 * 60, 2)).toBeNull();
  });

  it("does not treat a block starting exactly now as 'next'", () => {
    // At 09:00 the morning block is current, not upcoming.
    expect(nextBlock(blocks, 1, 9 * 60, 2)?.block.id).toBe("evening");
  });
});

describe("freeWindows", () => {
  it("finds the gaps between blocks", () => {
    const blocks = [
      block({ id: "a", startMinute: 9 * 60, endMinute: 12 * 60 }),
      block({ id: "b", startMinute: 14 * 60, endMinute: 16 * 60 }),
    ];
    const windows = freeWindows(blocks, 1, { fromMinute: 8 * 60, toMinute: 18 * 60 });
    expect(windows).toEqual([
      { startMinute: 480, endMinute: 540, durationMinutes: 60 },
      { startMinute: 720, endMinute: 840, durationMinutes: 120 },
      { startMinute: 960, endMinute: 1080, durationMinutes: 120 },
    ]);
  });

  it("does not invent free time inside an overlap", () => {
    // The naive pairwise walk would emit 12:00-... as free after the short
    // meeting ends, even though the long block is still running.
    const blocks = [
      block({ id: "long", startMinute: 9 * 60, endMinute: 17 * 60 }),
      block({ id: "meeting", startMinute: 10 * 60, endMinute: 11 * 60 }),
    ];
    const windows = freeWindows(blocks, 1, { fromMinute: 9 * 60, toMinute: 17 * 60 });
    expect(windows).toEqual([]);
  });

  it("treats a 'free' block as free, not as an obligation", () => {
    const blocks = [
      block({ id: "work", startMinute: 9 * 60, endMinute: 12 * 60 }),
      block({ id: "protected", kind: "free", startMinute: 12 * 60, endMinute: 14 * 60 }),
    ];
    const windows = freeWindows(blocks, 1, { fromMinute: 9 * 60, toMinute: 14 * 60 });
    expect(windows).toEqual([{ startMinute: 720, endMinute: 840, durationMinutes: 120 }]);
  });

  it("drops gaps shorter than the minimum", () => {
    const blocks = [
      block({ id: "a", startMinute: 9 * 60, endMinute: 10 * 60 }),
      block({ id: "b", startMinute: 10 * 60 + 10, endMinute: 12 * 60 }),
    ];
    expect(freeWindows(blocks, 1, { fromMinute: 9 * 60, toMinute: 12 * 60, minDurationMinutes: 15 })).toEqual(
      []
    );
  });

  it("returns the whole window when the day is empty", () => {
    expect(freeWindows([], 1, { fromMinute: 8 * 60, toMinute: 10 * 60 })).toEqual([
      { startMinute: 480, endMinute: 600, durationMinutes: 120 },
    ]);
  });
});

describe("nowNext", () => {
  const blocks = [
    block({ id: "work", startMinute: 9 * 60, endMinute: 13 * 60 }),
    block({ id: "gym", kind: "training", startMinute: 18 * 60, endMinute: 19 * 60 }),
  ];

  it("reports the current block, time left, and what follows", () => {
    const state = nowNext(blocks, 1, 12 * 60, 2);
    expect(state.current?.id).toBe("work");
    expect(state.minutesRemaining).toBe(60);
    expect(state.next?.block.id).toBe("gym");
    expect(state.nextFreeWindow).toEqual({ startMinute: 780, endMinute: 1080, durationMinutes: 300 });
  });

  it("reports nothing running between blocks", () => {
    const state = nowNext(blocks, 1, 15 * 60, 2);
    expect(state.current).toBeNull();
    expect(state.minutesRemaining).toBeNull();
    expect(state.next?.block.id).toBe("gym");
  });
});

describe("transitionsDue", () => {
  const blocks = [block({ id: "gym", kind: "training", startMinute: 18 * 60, endMinute: 19 * 60 })];

  it("catches a transition whose alert moment falls inside the sweep window", () => {
    // 17:45 with a 15-minute lead: the alert moment is exactly now.
    expect(transitionsDue(blocks, 1, 17 * 60 + 45, 15, 15).map((b) => b.id)).toEqual(["gym"]);
    // 17:35 with a 15-minute lead and a 15-minute sweep still catches it,
    // because the block starts within [17:50, 18:05).
    expect(transitionsDue(blocks, 1, 17 * 60 + 35, 15, 15).map((b) => b.id)).toEqual(["gym"]);
  });

  it("does not fire too early", () => {
    expect(transitionsDue(blocks, 1, 17 * 60, 15, 15)).toEqual([]);
  });

  it("does not fire once the block has started", () => {
    expect(transitionsDue(blocks, 1, 18 * 60, 15, 15)).toEqual([]);
  });

  it("is disabled by a zero lead time", () => {
    expect(transitionsDue(blocks, 1, 17 * 60 + 45, 0, 15)).toEqual([]);
  });
});

describe("bookedMinutes", () => {
  it("counts scheduled time once, even when blocks overlap", () => {
    const blocks = [
      block({ id: "long", startMinute: 9 * 60, endMinute: 17 * 60 }),
      block({ id: "meeting", startMinute: 10 * 60, endMinute: 11 * 60 }),
    ];
    expect(bookedMinutes(blocks, 1)).toBe(8 * 60);
  });

  it("is zero for an empty day", () => {
    expect(bookedMinutes([], 1)).toBe(0);
  });
});
