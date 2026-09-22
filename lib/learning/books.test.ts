import { describe, expect, it } from "vitest";
import {
  BOOK_STATUS_LABELS,
  bookProgressFraction,
  estimatedDaysToFinish,
  progressLabel,
  statusForProgress,
} from "@/lib/learning/books";

describe("bookProgressFraction", () => {
  it("divides progress by the total", () => {
    expect(bookProgressFraction({ totalUnits: 200, progressUnits: 50 })).toBe(0.25);
  });

  it("is 0, not NaN, when there is no total to divide by", () => {
    expect(bookProgressFraction({ totalUnits: 0, progressUnits: 5 })).toBe(0);
  });

  it("clamps to [0, 1] against bad data", () => {
    expect(bookProgressFraction({ totalUnits: 100, progressUnits: 150 })).toBe(1);
    expect(bookProgressFraction({ totalUnits: 100, progressUnits: -5 })).toBe(0);
  });
});

describe("progressLabel", () => {
  it("shows a fraction when there is a total", () => {
    expect(progressLabel({ totalUnits: 300, progressUnits: 120, unitLabel: "page" })).toBe("120/300 עמודים");
    expect(progressLabel({ totalUnits: 12, progressUnits: 3, unitLabel: "chapter" })).toBe("3/12 פרקים");
  });

  it("shows a bare count with no total", () => {
    expect(progressLabel({ totalUnits: 0, progressUnits: 45, unitLabel: "page" })).toBe("45 עמודים");
  });
});

describe("statusForProgress", () => {
  it("moves an unstarted book to reading the moment progress is logged", () => {
    expect(statusForProgress({ totalUnits: 300, progressUnits: 1, status: "to_read" })).toBe("reading");
  });

  it("finishes a book once progress reaches the total", () => {
    expect(statusForProgress({ totalUnits: 300, progressUnits: 300, status: "reading" })).toBe("finished");
    expect(statusForProgress({ totalUnits: 300, progressUnits: 301, status: "reading" })).toBe("finished");
  });

  it("leaves an unstarted book alone at zero progress", () => {
    expect(statusForProgress({ totalUnits: 300, progressUnits: 0, status: "to_read" })).toBe("to_read");
  });

  it("reopens a finished book if progress drops back below the total (a correction)", () => {
    expect(statusForProgress({ totalUnits: 300, progressUnits: 250, status: "finished" })).toBe("reading");
  });

  it("stays reading, not to_read, if progress is edited back down to a small nonzero value", () => {
    expect(statusForProgress({ totalUnits: 300, progressUnits: 5, status: "reading" })).toBe("reading");
  });
});

describe("estimatedDaysToFinish", () => {
  const now = new Date("2026-09-22T00:00:00Z");

  it("extrapolates the pace kept so far", () => {
    // 100 pages in 10 days = 10/day; 200 left -> 20 more days.
    const days = estimatedDaysToFinish(
      { totalUnits: 300, progressUnits: 100, startedAt: "2026-09-12T00:00:00Z", status: "reading" },
      now
    );
    expect(days).toBe(20);
  });

  it("is null for a book that has not been started, has no total, or is already finished", () => {
    expect(estimatedDaysToFinish({ totalUnits: 300, progressUnits: 0, startedAt: undefined, status: "to_read" }, now)).toBeNull();
    expect(estimatedDaysToFinish({ totalUnits: 0, progressUnits: 10, startedAt: "2026-09-12T00:00:00Z", status: "reading" }, now)).toBeNull();
    expect(estimatedDaysToFinish({ totalUnits: 300, progressUnits: 300, startedAt: "2026-09-12T00:00:00Z", status: "finished" }, now)).toBeNull();
  });

  it("is 0 when there is nothing left to read", () => {
    expect(estimatedDaysToFinish({ totalUnits: 300, progressUnits: 400, startedAt: "2026-09-12T00:00:00Z", status: "reading" }, now)).toBe(0);
  });

  it("never divides by a zero elapsed-days window (same day as started)", () => {
    const days = estimatedDaysToFinish({ totalUnits: 100, progressUnits: 20, startedAt: now.toISOString(), status: "reading" }, now);
    expect(days).not.toBeNull();
    expect(Number.isFinite(days)).toBe(true);
  });
});

describe("BOOK_STATUS_LABELS", () => {
  it("has a Hebrew label for every status", () => {
    for (const status of ["to_read", "reading", "finished"] as const) {
      expect(BOOK_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
