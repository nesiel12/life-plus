import { describe, expect, it } from "vitest";
import { formatClock, nextMode, remainingMs, sessionProgress } from "./pomodoro";

describe("pomodoro", () => {
  it("alternates focus and break", () => {
    expect(nextMode("focus")).toBe("break");
    expect(nextMode("break")).toBe("focus");
  });
  it("never goes negative", () => {
    expect(remainingMs(1000, 5000)).toBe(0);
    expect(remainingMs(5000, 1000)).toBe(4000);
  });
  it("formats and rounds up", () => {
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(61_500)).toBe("01:02");
  });
  it("reports progress through the session", () => {
    expect(sessionProgress("focus", 25 * 60_000)).toBe(0);
    expect(sessionProgress("break", 150_000)).toBeCloseTo(0.5);
    expect(sessionProgress("focus", 0)).toBe(1);
  });
});
