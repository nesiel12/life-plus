import { describe, expect, it } from "vitest";
import { computeFreeSlots } from "@/lib/calendarFreeSlots";

const d = (iso: string) => new Date(iso);

describe("computeFreeSlots", () => {
  it("returns the full range when there is no busy time", () => {
    const slots = computeFreeSlots([], d("2026-07-20T09:00:00Z"), d("2026-07-20T17:00:00Z"));
    expect(slots).toEqual([{ start: d("2026-07-20T09:00:00Z"), end: d("2026-07-20T17:00:00Z") }]);
  });

  it("splits around a single busy block", () => {
    const slots = computeFreeSlots(
      [{ start: "2026-07-20T12:00:00Z", end: "2026-07-20T13:00:00Z" }],
      d("2026-07-20T09:00:00Z"),
      d("2026-07-20T17:00:00Z")
    );
    expect(slots).toEqual([
      { start: d("2026-07-20T09:00:00Z"), end: d("2026-07-20T12:00:00Z") },
      { start: d("2026-07-20T13:00:00Z"), end: d("2026-07-20T17:00:00Z") },
    ]);
  });

  it("drops slots shorter than the 30-minute minimum", () => {
    const slots = computeFreeSlots(
      [{ start: "2026-07-20T09:10:00Z", end: "2026-07-20T17:00:00Z" }],
      d("2026-07-20T09:00:00Z"),
      d("2026-07-20T17:00:00Z")
    );
    expect(slots).toEqual([]);
  });

  it("merges overlapping busy periods and sorts unsorted input", () => {
    const slots = computeFreeSlots(
      [
        { start: "2026-07-20T14:00:00Z", end: "2026-07-20T15:00:00Z" },
        { start: "2026-07-20T09:00:00Z", end: "2026-07-20T09:45:00Z" },
        { start: "2026-07-20T09:30:00Z", end: "2026-07-20T10:00:00Z" },
      ],
      d("2026-07-20T09:00:00Z"),
      d("2026-07-20T17:00:00Z")
    );
    expect(slots).toEqual([
      { start: d("2026-07-20T10:00:00Z"), end: d("2026-07-20T14:00:00Z") },
      { start: d("2026-07-20T15:00:00Z"), end: d("2026-07-20T17:00:00Z") },
    ]);
  });

  it("returns nothing when busy time covers the whole range", () => {
    const slots = computeFreeSlots(
      [{ start: "2026-07-20T09:00:00Z", end: "2026-07-20T17:00:00Z" }],
      d("2026-07-20T09:00:00Z"),
      d("2026-07-20T17:00:00Z")
    );
    expect(slots).toEqual([]);
  });
});
