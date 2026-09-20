import { describe, expect, it } from "vitest";
import { energyAdvice, energyAt, energyCurve, energyWindows, hourLabel, parseHour } from "@/lib/health/energyCurve";

describe("parseHour", () => {
  it("reads HH:MM and falls back on junk", () => {
    expect(parseHour("06:30", 7)).toBe(6.5);
    expect(parseHour("25:00", 7)).toBe(7);
    expect(parseHour(undefined, 23)).toBe(23);
  });
});

describe("energyCurve", () => {
  const curve = energyCurve({ chronotype: { wakeTime: "07:00", sleepTime: "23:00" } });

  it("has 24 hourly points within 0..1", () => {
    expect(curve).toHaveLength(24);
    for (const p of curve) {
      expect(p.energy).toBeGreaterThanOrEqual(0);
      expect(p.energy).toBeLessThanOrEqual(1);
    }
  });

  it("is asleep outside the waking window, including across midnight", () => {
    expect(curve[3].asleep).toBe(true);
    expect(curve[23].asleep).toBe(true);
    expect(curve[10].asleep).toBe(false);
    const nightOwl = energyCurve({ chronotype: { wakeTime: "09:00", sleepTime: "01:00" } });
    expect(nightOwl[0].asleep).toBe(false);
    expect(nightOwl[4].asleep).toBe(true);
  });

  it("has the textbook shape: late-morning peak above the post-lunch dip", () => {
    const peak = curve[11].energy;
    const dip = curve[14].energy;
    expect(peak).toBeGreaterThan(dip);
    expect(curve[7].energy).toBeLessThan(peak); // sleep inertia
    expect(curve[22].energy).toBeLessThan(curve[18].energy); // winding down
  });

  it("follows the person's own peak and low day-parts", () => {
    const tuned = energyCurve({
      chronotype: { wakeTime: "07:00", sleepTime: "23:00", peakFocusHours: ["evening"], lowEnergyHours: ["morning"] },
    });
    expect(tuned[17].energy).toBeGreaterThan(curve[17].energy);
    expect(tuned[10].energy).toBeLessThan(curve[10].energy);
  });

  it("lifts the hours after a workout and dips after a big meal", () => {
    const withWorkout = energyCurve({
      workouts: [{ startTime: new Date(2026, 8, 18, 16, 0).toISOString(), endTime: new Date(2026, 8, 18, 17, 0).toISOString() }],
    });
    expect(withWorkout[17].energy).toBeGreaterThan(curve[17].energy);
    const withLunch = energyCurve({ meals: [{ eatenAt: new Date(2026, 8, 18, 13, 0).toISOString(), calories: 900 }] });
    expect(withLunch[14].energy).toBeLessThan(curve[14].energy);
  });
});

describe("energyWindows", () => {
  const curve = energyCurve();

  it("finds a morning peak and an afternoon rest window, and ignores sleep", () => {
    const windows = energyWindows(curve);
    const peak = windows.find((w) => w.kind === "peak");
    const rest = windows.find((w) => w.kind === "rest");
    expect(peak && peak.startHour >= 9 && peak.endHour <= 14).toBe(true);
    expect(rest).toBeDefined();
    for (const w of windows) expect(w.endHour - w.startHour).toBeGreaterThanOrEqual(2);
  });
});

describe("energyAt and advice", () => {
  const curve = energyCurve();
  const windows = energyWindows(curve);

  it("interpolates between hourly samples", () => {
    const value = energyAt(curve, new Date(2026, 8, 18, 11, 0));
    expect(value).toBeGreaterThan(0.5);
    expect(value).toBeLessThanOrEqual(1);
  });

  it("speaks to the moment, without a gendered pronoun", () => {
    const peakHour = windows.find((w) => w.kind === "peak")!.startHour;
    const inPeak = energyAdvice(0.9, windows, new Date(2026, 8, 18, peakHour, 10));
    expect(inPeak).toContain("חלון השיא");
    expect(inPeak).not.toMatch(/\bאתה\b|\bאת\b/);
    expect(energyAdvice(0.3, windows, new Date(2026, 8, 18, 22, 0))).toContain("להאט");
  });

  it("labels hours as HH:00", () => {
    expect(hourLabel(9)).toBe("09:00");
    expect(hourLabel(24)).toBe("00:00");
  });
});
