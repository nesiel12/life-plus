import { describe, expect, it } from "vitest";
import { buildWellnessSuggestions, lastWorkout } from "@/lib/health/wellnessCopilot";
import type { Meal, Workout } from "@/types";

const at = (day: number, hour: number) => new Date(2026, 8, day, hour, 0, 0, 0);

function meal(overrides: Partial<Meal> & Pick<Meal, "id" | "type">): Meal {
  return {
    description: "x",
    eatenAt: at(15, 8).toISOString(),
    createdAt: at(15, 8).toISOString(),
    ...overrides,
  };
}
function workout(overrides: Partial<Workout> & Pick<Workout, "id">): Workout {
  return {
    title: "ריצה",
    startTime: at(15, 7).toISOString(),
    createdAt: at(15, 7).toISOString(),
    ...overrides,
  };
}

function build(over: Partial<Parameters<typeof buildWellnessSuggestions>[0]> = {}) {
  return buildWellnessSuggestions({ meals: [], workouts: [], now: at(15, 10), ...over });
}

describe("lastWorkout", () => {
  it("returns null with no workouts", () => {
    expect(lastWorkout([])).toBeNull();
  });

  it("picks the most recent by start time, not array order", () => {
    const older = workout({ id: "a", startTime: at(10, 7).toISOString() });
    const newer = workout({ id: "b", startTime: at(14, 7).toISOString() });
    expect(lastWorkout([newer, older])!.id).toBe("b");
  });
});

describe("workout suggestions", () => {
  it("suggests a workout when none is logged today", () => {
    const s = build().find((x) => x.kind === "workout");
    expect(s).toBeDefined();
    expect(s!.detail).toContain("לא רשמת אימון");
  });

  it("does not suggest one when a workout is already logged today", () => {
    const s = build({ workouts: [workout({ id: "w" })] });
    expect(s.some((x) => x.kind === "workout")).toBe(false);
  });

  it("names the real gap when it has been days", () => {
    const s = build({ workouts: [workout({ id: "w", startTime: at(10, 7).toISOString() })] })
      .find((x) => x.kind === "workout");
    expect(s!.detail).toContain("5 ימים");
  });

  // Suggesting a 30-minute session into a 10-minute gap teaches the user the
  // suggestions aren't real.
  it("offers 'now' only when there is genuinely time", () => {
    expect(build({ freeMinutesNow: 45 }).find((x) => x.kind === "workout")!.title).toBe("אימון עכשיו");
    expect(build({ freeMinutesNow: 10 }).find((x) => x.kind === "workout")!.title).toBe("אימון בהמשך");
  });

  it("defers the schedule when the gap is too short", () => {
    expect(build({ freeMinutesNow: 10 }).find((x) => x.kind === "workout")!.scheduleMinutes).toBe(60);
  });

  it("assumes time is available when the calendar is unknown, rather than blocking", () => {
    expect(build({ freeMinutesNow: undefined }).find((x) => x.kind === "workout")!.title).toBe("אימון עכשיו");
  });

  it("ranks a long gap above a fresh one", () => {
    const stale = build({ workouts: [workout({ id: "w", startTime: at(1, 7).toISOString() })] });
    const fresh = build({ workouts: [workout({ id: "w", startTime: at(14, 7).toISOString() })] });
    const staleScore = stale.find((x) => x.kind === "workout")!.score;
    const freshScore = fresh.find((x) => x.kind === "workout")!.score;
    expect(staleScore).toBeGreaterThan(freshScore);
  });
});

describe("nutrition suggestions", () => {
  it("flags a missing breakfast in the morning window", () => {
    const s = build({ now: at(15, 10) }).find((x) => x.kind === "nutrition");
    expect(s!.title).toContain("בוקר");
  });

  it("stays quiet once breakfast is logged", () => {
    const s = build({ now: at(15, 10), meals: [meal({ id: "m", type: "breakfast" })] });
    expect(s.some((x) => x.id === "nutrition-breakfast")).toBe(false);
  });

  it("flags a missing lunch in the afternoon window", () => {
    const s = build({ now: at(15, 14) }).find((x) => x.kind === "nutrition");
    expect(s!.title).toContain("צהריים");
  });

  it("suggests a snack later in the day once something has been eaten", () => {
    const s = build({ now: at(15, 17), meals: [meal({ id: "m", type: "lunch" })] });
    expect(s.some((x) => x.id === "nutrition-snack")).toBe(true);
  });

  it("only counts today's meals, not yesterday's", () => {
    const yesterday = meal({ id: "m", type: "breakfast", eatenAt: at(14, 8).toISOString() });
    const s = build({ now: at(15, 10), meals: [yesterday] });
    expect(s.some((x) => x.id === "nutrition-breakfast")).toBe(true);
  });
});

describe("hydration", () => {
  it("nudges during waking hours", () => {
    expect(build({ now: at(15, 12) }).some((x) => x.kind === "hydration")).toBe(true);
  });

  it("stays quiet overnight", () => {
    expect(build({ now: at(15, 3) }).some((x) => x.kind === "hydration")).toBe(false);
  });

  // The app does not track water intake, so a "3 of 8 glasses" count would be
  // a fabricated number presented as fact.
  it("never claims a count it cannot know", () => {
    const s = build({ now: at(15, 12) }).find((x) => x.kind === "hydration")!;
    expect(s.detail).not.toMatch(/\d/);
  });
});

describe("mindset", () => {
  it("adapts to the time of day", () => {
    const morning = build({ now: at(15, 9) }).find((x) => x.kind === "mindset")!;
    const evening = build({ now: at(15, 18) }).find((x) => x.kind === "mindset")!;
    const night = build({ now: at(15, 22) }).find((x) => x.kind === "mindset")!;
    expect(new Set([morning.title, evening.title, night.title]).size).toBe(3);
  });

  it("names the afternoon dip rather than a generic tip", () => {
    expect(build({ now: at(15, 14) }).find((x) => x.kind === "mindset")!.title).toContain("ריכוז");
  });

  it("omits mindset in the small hours, which no day-part covers", () => {
    expect(build({ now: at(15, 3) }).some((x) => x.kind === "mindset")).toBe(false);
  });
});

describe("ranking", () => {
  it("puts workout above nutrition, hydration and mindset", () => {
    const kinds = build({ now: at(15, 10) }).map((s) => s.kind);
    expect(kinds[0]).toBe("workout");
    expect(kinds.indexOf("nutrition")).toBeLessThan(kinds.indexOf("hydration"));
    expect(kinds.indexOf("hydration")).toBeLessThan(kinds.indexOf("mindset"));
  });

  it("is stable for identical input", () => {
    expect(build({ now: at(15, 10) })).toEqual(build({ now: at(15, 10) }));
  });

  it("returns ids that are unique", () => {
    const ids = build({ now: at(15, 10) }).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
