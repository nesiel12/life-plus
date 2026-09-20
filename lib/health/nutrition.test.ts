import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGETS,
  MEAL_PRESETS,
  caloriesFromMacros,
  mealTypeForHour,
  nutritionPaceTip,
  readTargets,
  ringProgress,
  sanitizeEstimate,
  sumMacros,
} from "@/lib/health/nutrition";

describe("readTargets", () => {
  it("falls back to defaults for missing or junk values", () => {
    expect(readTargets(null)).toEqual(DEFAULT_TARGETS);
    expect(readTargets({ calories: "abc", proteinG: -5 })).toEqual(DEFAULT_TARGETS);
  });

  it("keeps valid values and clamps absurd ones", () => {
    expect(readTargets({ calories: 1800, waterMl: 99999 })).toMatchObject({ calories: 1800, waterMl: 6000 });
    expect(readTargets({ proteinG: 3 }).proteinG).toBe(20);
  });
});

describe("sumMacros", () => {
  it("adds known meals and counts unknown ones separately — unknown is never zero", () => {
    const totals = sumMacros([
      { calories: 500, proteinG: 30, carbsG: 50, fatG: 15 },
      { calories: null, proteinG: null, carbsG: null, fatG: null },
      { proteinG: 20, carbsG: 10, fatG: 5 },
    ]);
    expect(totals).toMatchObject({ known: 2, unknown: 1, proteinG: 50, carbsG: 60, fatG: 20 });
    // The third meal had no calories: derived from its macros (4/4/9).
    expect(totals.calories).toBe(500 + caloriesFromMacros(20, 10, 5));
  });

  it("is all zeros for an empty day", () => {
    expect(sumMacros([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0, known: 0, unknown: 0 });
  });
});

describe("ringProgress", () => {
  it("fills to the target and reports what remains", () => {
    expect(ringProgress(65, 130)).toEqual({ fraction: 0.5, over: false, remaining: 65 });
  });

  it("caps the ring at full and flags a real overshoot", () => {
    expect(ringProgress(2600, 2200)).toEqual({ fraction: 1, over: true, remaining: 0 });
    expect(ringProgress(2250, 2200).over).toBe(false);
  });

  it("is empty for a zero target", () => {
    expect(ringProgress(10, 0).fraction).toBe(0);
  });
});

describe("sanitizeEstimate", () => {
  it("keeps calories that agree with the macros", () => {
    expect(sanitizeEstimate({ calories: 610, proteinG: 48, carbsG: 70, fatG: 12 })).toMatchObject({ calories: 610 });
  });

  it("recomputes calories that contradict the macros", () => {
    const fixed = sanitizeEstimate({ calories: 1500, proteinG: 30, carbsG: 40, fatG: 10 });
    expect(fixed.calories).toBe(caloriesFromMacros(30, 40, 10));
  });

  it("clamps negatives, NaN and absurd values", () => {
    expect(sanitizeEstimate({ calories: NaN, proteinG: -3, carbsG: 9999, fatG: 5 })).toMatchObject({ proteinG: 0, carbsG: 500 });
  });
});

describe("mealTypeForHour", () => {
  it("maps the clock to a meal slot", () => {
    expect(mealTypeForHour(8)).toBe("breakfast");
    expect(mealTypeForHour(13)).toBe("lunch");
    expect(mealTypeForHour(17)).toBe("snack");
    expect(mealTypeForHour(20)).toBe("dinner");
    expect(mealTypeForHour(2)).toBe("snack");
  });
});

describe("presets", () => {
  it("are Hebrew-labelled and internally consistent (±20% Atwater)", () => {
    for (const preset of MEAL_PRESETS) {
      expect(preset.label).not.toMatch(/[A-Za-z]/);
      const derived = caloriesFromMacros(preset.proteinG, preset.carbsG, preset.fatG);
      expect(Math.abs(preset.calories - derived) / derived).toBeLessThanOrEqual(0.2);
    }
    expect(new Set(MEAL_PRESETS.map((p) => p.id)).size).toBe(MEAL_PRESETS.length);
  });
});

describe("nutritionPaceTip", () => {
  const at = (hour: number) => new Date(2026, 8, 18, hour, 0);
  const none = sumMacros([]);

  it("nudges toward breakfast in the morning when nothing is logged", () => {
    expect(nutritionPaceTip(none, DEFAULT_TARGETS, at(8))).toContain("ארוחת בוקר");
  });

  it("asks for estimates when meals exist but none has numbers", () => {
    expect(nutritionPaceTip(sumMacros([{}]), DEFAULT_TARGETS, at(13))).toContain("הערכה");
  });

  it("flags protein behind pace, with the missing grams", () => {
    const tip = nutritionPaceTip(sumMacros([{ calories: 900, proteinG: 20, carbsG: 150, fatG: 20 }]), DEFAULT_TARGETS, at(19));
    expect(tip).toContain("החלבון");
    expect(tip).toContain("110");
  });

  it("flags an overshoot of calories", () => {
    const tip = nutritionPaceTip(sumMacros([{ calories: 2600, proteinG: 150, carbsG: 300, fatG: 80 }]), DEFAULT_TARGETS, at(20));
    expect(tip).toContain("עברת");
  });

  it("says a balanced day is balanced", () => {
    const tip = nutritionPaceTip(sumMacros([{ calories: 700, proteinG: 45, carbsG: 80, fatG: 20 }]), DEFAULT_TARGETS, at(11));
    expect(tip).toContain("מאוזן");
  });
});
