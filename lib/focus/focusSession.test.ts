import { describe, expect, it } from "vitest";
import {
  DEFAULT_FOCUS_MINUTES,
  formatRemaining,
  pause,
  progressOf,
  resume,
  startSession,
} from "@/lib/focus/focusSession";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

describe("startSession", () => {
  it("defaults to the standard focus length", () => {
    expect(startSession({ now: T0 }).durationMinutes).toBe(DEFAULT_FOCUS_MINUTES);
  });

  it("carries the task it is tethered to", () => {
    const s = startSession({ taskId: "t1", taskTitle: "לכתוב דוח", now: T0 });
    expect(s.taskId).toBe("t1");
    expect(s.taskTitle).toBe("לכתוב דוח");
  });

  it("allows an untethered session", () => {
    const s = startSession({ now: T0 });
    expect(s.taskId).toBeNull();
  });
});

describe("progressOf", () => {
  it("is empty at the moment it starts", () => {
    const p = progressOf(startSession({ now: T0 }), T0);
    expect(p.elapsedMs).toBe(0);
    expect(p.fraction).toBe(0);
    expect(p.isComplete).toBe(false);
    expect(p.display).toBe("25:00");
  });

  it("advances with the clock", () => {
    const p = progressOf(startSession({ now: T0 }), T0 + 5 * MIN);
    expect(p.elapsedMs).toBe(5 * MIN);
    expect(p.remainingMs).toBe(20 * MIN);
    expect(p.fraction).toBeCloseTo(0.2);
    expect(p.display).toBe("20:00");
  });

  it("completes exactly at the duration", () => {
    const p = progressOf(startSession({ now: T0 }), T0 + 25 * MIN);
    expect(p.isComplete).toBe(true);
    expect(p.remainingMs).toBe(0);
    expect(p.display).toBe("00:00");
  });

  it("clamps rather than going negative past the end", () => {
    const p = progressOf(startSession({ now: T0 }), T0 + 40 * MIN);
    expect(p.remainingMs).toBe(0);
    expect(p.fraction).toBe(1);
    expect(p.display).toBe("00:00");
  });

  it("never reports negative elapsed if the clock jumps backwards", () => {
    const p = progressOf(startSession({ now: T0 }), T0 - 10_000);
    expect(p.elapsedMs).toBe(0);
  });

  it("handles a zero-length session without dividing by zero", () => {
    const s = startSession({ durationMinutes: 0, now: T0 });
    const p = progressOf(s, T0);
    expect(p.fraction).toBe(0);
    expect(p.isComplete).toBe(true);
  });
});

describe("pause and resume", () => {
  // The property that matters: a pause must not consume the session.
  it("freezes the countdown while paused", () => {
    let s = startSession({ now: T0 });
    s = pause(s, T0 + 5 * MIN);

    const atPause = progressOf(s, T0 + 5 * MIN);
    const tenMinutesLater = progressOf(s, T0 + 15 * MIN);
    expect(tenMinutesLater.remainingMs).toBe(atPause.remainingMs);
    expect(tenMinutesLater.isPaused).toBe(true);
  });

  it("gives back the paused time on resume", () => {
    let s = startSession({ now: T0 });
    s = pause(s, T0 + 5 * MIN);
    s = resume(s, T0 + 15 * MIN); // paused for 10 minutes

    // 5 minutes were spent before the pause; 20 should remain.
    const p = progressOf(s, T0 + 15 * MIN);
    expect(p.remainingMs).toBe(20 * MIN);
    expect(p.isPaused).toBe(false);
  });

  it("accumulates across several pauses", () => {
    let s = startSession({ now: T0 });
    s = pause(s, T0 + 2 * MIN);
    s = resume(s, T0 + 4 * MIN); // +2 paused
    s = pause(s, T0 + 6 * MIN);
    s = resume(s, T0 + 10 * MIN); // +4 paused, 6 total

    // 4 minutes of real work done by T0+10m.
    expect(progressOf(s, T0 + 10 * MIN).elapsedMs).toBe(4 * MIN);
  });

  it("keeps the original start time so 'when did I begin' stays answerable", () => {
    let s = startSession({ now: T0 });
    s = pause(s, T0 + MIN);
    s = resume(s, T0 + 5 * MIN);
    expect(s.startedAt).toBe(T0);
  });

  it("ignores a double pause", () => {
    let s = startSession({ now: T0 });
    s = pause(s, T0 + MIN);
    const again = pause(s, T0 + 3 * MIN);
    expect(again.pausedAt).toBe(s.pausedAt);
  });

  it("ignores a resume when not paused", () => {
    const s = startSession({ now: T0 });
    expect(resume(s, T0 + MIN)).toEqual(s);
  });
});

describe("formatRemaining", () => {
  it("zero-pads both fields", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(9 * 1000)).toBe("00:09");
    expect(formatRemaining(65 * 1000)).toBe("01:05");
  });

  it("rounds up, so 0.5s left never reads as 00:00", () => {
    expect(formatRemaining(500)).toBe("00:01");
  });

  it("handles over an hour", () => {
    expect(formatRemaining(90 * MIN)).toBe("90:00");
  });

  it("clamps negatives", () => {
    expect(formatRemaining(-5000)).toBe("00:00");
  });
});
