import { describe, expect, it } from "vitest";
import {
  INTENSITY_LABELS,
  QUICK_WORKOUTS,
  WORKOUT_KINDS,
  elapsedMs,
  estimateCaloriesBurned,
  formatClock,
  heartRateZone,
  pauseTimer,
  readTimer,
  resumeTimer,
  startTimer,
} from "@/lib/health/workout";

describe("calorie estimates", () => {
  it("scale with kind, intensity and time", () => {
    const easyWalk = estimateCaloriesBurned("walk", 2, 30);
    const hardRun = estimateCaloriesBurned("cardio", 5, 30);
    expect(hardRun).toBeGreaterThan(easyWalk * 2);
    expect(estimateCaloriesBurned("strength", 3, 60)).toBe(350); // 5 MET × 1.0 × 70kg × 1h
    expect(estimateCaloriesBurned("yoga", 3, 0)).toBe(0);
  });

  it("clamps intensity into 1..5", () => {
    expect(estimateCaloriesBurned("walk", 99, 60)).toBe(estimateCaloriesBurned("walk", 5, 60));
  });
});

describe("the live timer", () => {
  it("counts active time only, across pauses", () => {
    let state = startTimer(0);
    state = pauseTimer(state, 60_000);
    expect(elapsedMs(state, 600_000)).toBe(60_000); // frozen while paused
    state = resumeTimer(state, 120_000);
    expect(elapsedMs(state, 180_000)).toBe(120_000);
  });

  it("ignores a double pause or a resume that was not paused", () => {
    const running = startTimer(0);
    expect(resumeTimer(running, 10)).toBe(running);
    const paused = pauseTimer(running, 5);
    expect(pauseTimer(paused, 50)).toBe(paused);
  });

  it("formats like a stopwatch", () => {
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(3_729_000)).toBe("1:02:09");
    expect(formatClock(0)).toBe("0:00");
  });

  it("reads a stored timer defensively", () => {
    expect(readTimer({ startedAt: 1, pausedAt: null, pausedMs: 0 })).toEqual({ startedAt: 1, pausedAt: null, pausedMs: 0 });
    expect(readTimer({ startedAt: "x" })).toBeNull();
    expect(readTimer(null)).toBeNull();
  });
});

describe("heart rate", () => {
  it("assigns zones against 220 − age", () => {
    expect(heartRateZone(90, 35).zone).toBe(1);
    expect(heartRateZone(140, 35).zone).toBe(3);
    expect(heartRateZone(180, 35).zone).toBe(5);
    expect(heartRateZone(140, 35).label).toBe("אירובי");
  });
});

describe("catalogues", () => {
  it("are Hebrew and complete", () => {
    for (const k of WORKOUT_KINDS) expect(k.label).not.toMatch(/[A-Za-z]/);
    expect(Object.keys(INTENSITY_LABELS)).toHaveLength(5);
    for (const q of QUICK_WORKOUTS) expect(q.minutes).toBeGreaterThan(0);
  });
});

describe("sessions", () => {
  it("summarises the sets done, skipping untouched cards", async () => {
    const { routineSummary } = await import("@/lib/health/workout");
    expect(routineSummary({ סקוואט: 3, פלאנק: 2, מתח: 0 })).toBe("סקוואט ×3 · פלאנק ×2");
    expect(routineSummary({})).toBe("");
  });

  it("summarises the last seven days, estimating missing calories", async () => {
    const { weekSummary, estimateCaloriesBurned: estimate, EXERCISES } = await import("@/lib/health/workout");
    const now = new Date(2026, 8, 18, 12);
    const iso = (d: number, h: number) => new Date(2026, 8, d, h).toISOString();
    const summary = weekSummary(
      [
        { startTime: iso(17, 7), endTime: iso(17, 8), kind: "cardio", intensity: 4, caloriesBurned: 600 },
        { startTime: iso(15, 18), endTime: new Date(2026, 8, 15, 18, 30).toISOString(), kind: "walk", intensity: 2 },
        { startTime: iso(1, 7), endTime: iso(1, 8), kind: "cardio" }, // too old
      ],
      now
    );
    expect(summary).toEqual({ sessions: 2, minutes: 90, calories: 600 + estimate("walk", 2, 30) });
    for (const list of Object.values(EXERCISES)) expect(list.length).toBeGreaterThan(0);
  });
});
