import { describe, expect, it } from "vitest";
import {
  findOverlaps,
  normalizeImportedBlocks,
  scheduleImportSchema,
  type NormalizedBlock,
  type ScheduleImportResult,
} from "@/lib/schedule/importSchedule";

function raw(overrides: Partial<ScheduleImportResult["blocks"][number]> = {}) {
  return {
    title: "שיעור",
    kind: "study" as const,
    weekdays: [0],
    startTime: "09:00",
    endTime: "10:30",
    ...overrides,
  };
}

function result(blocks: ScheduleImportResult["blocks"], warnings: string[] = []): ScheduleImportResult {
  return { blocks, warnings };
}

describe("scheduleImportSchema", () => {
  it("accepts a well-formed extraction", () => {
    expect(scheduleImportSchema.parse({ blocks: [raw()], warnings: [] }).blocks).toHaveLength(1);
  });

  it("defaults warnings so callers never have to null-check them", () => {
    expect(scheduleImportSchema.parse({ blocks: [] }).warnings).toEqual([]);
  });

  it("rejects a weekday outside 0-6", () => {
    expect(() => scheduleImportSchema.parse({ blocks: [raw({ weekdays: [7] })] })).toThrow();
  });

  it("rejects an unknown kind rather than storing it", () => {
    expect(() =>
      scheduleImportSchema.parse({ blocks: [{ ...raw(), kind: "napping" }] })
    ).toThrow();
  });
});

describe("normalizeImportedBlocks", () => {
  it("converts times to minutes since midnight", () => {
    const { blocks } = normalizeImportedBlocks(result([raw({ startTime: "9:15", endTime: "10:45" })]));
    expect(blocks[0].startMinute).toBe(555);
    expect(blocks[0].endMinute).toBe(645);
  });

  it("merges identical blocks that differ only by weekday", () => {
    // A model reading a grid typically emits one row per cell — the same
    // 09:00 lesson once per column.
    const { blocks } = normalizeImportedBlocks(
      result([
        raw({ weekdays: [0] }),
        raw({ weekdays: [2] }),
        raw({ weekdays: [4] }),
      ])
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].weekdays).toEqual([0, 2, 4]);
  });

  it("does not merge blocks that share a title but not a time", () => {
    const { blocks } = normalizeImportedBlocks(
      result([raw({ weekdays: [0] }), raw({ weekdays: [1], startTime: "11:00", endTime: "12:00" })])
    );
    expect(blocks).toHaveLength(2);
  });

  it("drops a block whose end is not after its start, and says why", () => {
    const { blocks, warnings } = normalizeImportedBlocks(
      result([raw({ title: "משמרת לילה", startTime: "22:00", endTime: "01:00" })])
    );
    expect(blocks).toHaveLength(0);
    // Silently discarding it would leave a hole the user cannot see.
    expect(warnings.join(" ")).toContain("משמרת לילה");
    expect(warnings.join(" ")).toContain("חוצה חצות");
  });

  it("drops a block with unreadable times, and says why", () => {
    const { blocks, warnings } = normalizeImportedBlocks(
      result([{ ...raw({ title: "לא ברור" }), startTime: "99:99", endTime: "10:00" }])
    );
    expect(blocks).toHaveLength(0);
    expect(warnings.join(" ")).toContain("לא ברור");
  });

  it("keeps the model's own warnings alongside its own", () => {
    const { warnings } = normalizeImportedBlocks(
      result([raw({ startTime: "99:99" })], ["העמודה האחרונה מטושטשת"])
    );
    expect(warnings[0]).toBe("העמודה האחרונה מטושטשת");
    expect(warnings).toHaveLength(2);
  });

  it("deduplicates and sorts weekdays", () => {
    const { blocks } = normalizeImportedBlocks(result([raw({ weekdays: [3, 1, 1, 0] })]));
    expect(blocks[0].weekdays).toEqual([0, 1, 3]);
  });

  it("returns blocks in start order", () => {
    const { blocks } = normalizeImportedBlocks(
      result([
        raw({ title: "מאוחר", startTime: "14:00", endTime: "15:00" }),
        raw({ title: "מוקדם", startTime: "08:00", endTime: "09:00" }),
      ])
    );
    expect(blocks.map((b) => b.title)).toEqual(["מוקדם", "מאוחר"]);
  });

  it("clamps an end time of 24:00 to the end of the day", () => {
    const { blocks } = normalizeImportedBlocks(
      result([raw({ startTime: "22:00", endTime: "24:00" })])
    );
    expect(blocks[0].endMinute).toBe(1440);
  });
});

describe("findOverlaps", () => {
  function block(overrides: Partial<NormalizedBlock> = {}): NormalizedBlock {
    return {
      title: "בלוק",
      kind: "study",
      weekdays: [0],
      startMinute: 540,
      endMinute: 630,
      ...overrides,
    };
  }

  it("finds two blocks clashing on a shared day", () => {
    const clashes = findOverlaps([
      block({ title: "א" }),
      block({ title: "ב", startMinute: 600, endMinute: 700 }),
    ]);
    expect(clashes).toHaveLength(1);
  });

  it("ignores blocks that never share a day", () => {
    expect(
      findOverlaps([block({ weekdays: [0] }), block({ weekdays: [1] })])
    ).toEqual([]);
  });

  it("treats touching blocks as non-overlapping", () => {
    // 09:00-10:30 followed by 10:30-11:30 is a normal timetable, not a clash.
    expect(
      findOverlaps([block(), block({ startMinute: 630, endMinute: 690 })])
    ).toEqual([]);
  });
});
