import { describe, expect, it } from "vitest";
import { energyForHour, isAsleepAt, parseClock } from "@/lib/calendar/energy";
import type { ChronotypeSettings } from "@/types";

describe("parseClock", () => {
  it("returns minutes since midnight", () => {
    expect(parseClock("06:30")).toBe(390);
    expect(parseClock("00:00")).toBe(0);
    expect(parseClock("23:59")).toBe(1439);
  });

  it("rejects malformed and out-of-range values", () => {
    for (const bad of [undefined, "", "abc", "6:3", "24:00", "12:60", "-1:00"]) {
      expect(parseClock(bad as string | undefined)).toBeNull();
    }
  });
});

describe("isAsleepAt", () => {
  const overnight: ChronotypeSettings = { sleepTime: "23:00", wakeTime: "06:30" };

  it("covers a sleep window that wraps midnight", () => {
    expect(isAsleepAt(23 * 60, overnight)).toBe(true);
    expect(isAsleepAt(2 * 60, overnight)).toBe(true);
    expect(isAsleepAt(6 * 60 + 29, overnight)).toBe(true);
  });

  it("excludes waking hours, with wake time itself already awake", () => {
    expect(isAsleepAt(6 * 60 + 30, overnight)).toBe(false);
    expect(isAsleepAt(12 * 60, overnight)).toBe(false);
    expect(isAsleepAt(22 * 60 + 59, overnight)).toBe(false);
  });

  it("handles a same-day sleep window without wrapping", () => {
    const daytime: ChronotypeSettings = { sleepTime: "01:00", wakeTime: "09:00" };
    expect(isAsleepAt(3 * 60, daytime)).toBe(true);
    expect(isAsleepAt(23 * 60, daytime)).toBe(false);
  });

  it("is never asleep when either end is missing or the window is empty", () => {
    expect(isAsleepAt(3 * 60, { sleepTime: "23:00" })).toBe(false);
    expect(isAsleepAt(3 * 60, { wakeTime: "06:30" })).toBe(false);
    expect(isAsleepAt(3 * 60, {})).toBe(false);
    expect(isAsleepAt(3 * 60, { sleepTime: "07:00", wakeTime: "07:00" })).toBe(false);
  });
});

describe("energyForHour", () => {
  const chronotype: ChronotypeSettings = {
    sleepTime: "23:00",
    wakeTime: "06:30",
    peakFocusHours: ["earlyMorning", "morning"],
    lowEnergyHours: ["afternoon"],
  };

  it("marks peak and low day parts from the user's own answers", () => {
    expect(energyForHour(9, chronotype)).toBe("peak");
    expect(energyForHour(14, chronotype)).toBe("low");
  });

  it("returns neutral for day parts the user did not flag", () => {
    expect(energyForHour(18, chronotype)).toBe("neutral");
  });

  it("lets sleep override a flagged day part", () => {
    // 07:00 is earlyMorning and flagged peak, but this person sleeps until 08:00.
    expect(energyForHour(7, { ...chronotype, wakeTime: "08:00" })).toBe("asleep");
  });

  it("treats the small hours as neutral when no sleep window is known", () => {
    expect(energyForHour(3, { peakFocusHours: ["morning"] })).toBe("neutral");
  });

  it("prefers peak when a day part is flagged as both", () => {
    const conflicted: ChronotypeSettings = {
      peakFocusHours: ["morning"],
      lowEnergyHours: ["morning"],
    };
    expect(energyForHour(9, conflicted)).toBe("peak");
  });

  it("is neutral when the user has answered nothing at all", () => {
    expect(energyForHour(9, {})).toBe("neutral");
  });
});

// ── Observed energy ───────────────────────────────────────────────────────
//
// What the check-ins actually show, versus what the user predicted about
// themselves during onboarding.

describe("observed energy overrides the declared chronotype", () => {
  const chronotype = {
    wakeTime: "06:00",
    sleepTime: "23:00",
    peakFocusHours: ["morning" as const],
    lowEnergyHours: ["afternoon" as const],
  };

  it("marks an observed peak hour as peak", () => {
    expect(energyForHour(15, chronotype, { peakHours: [15], lowHours: [] })).toBe("peak");
  });

  it("marks an observed low hour as low", () => {
    expect(energyForHour(9, chronotype, { peakHours: [], lowHours: [9] })).toBe("low");
  });

  // The chronotype says afternoons (12-16) are low; the check-ins say 15:00
  // is a peak. The observation is the one that actually happened — and the
  // rest of the afternoon still follows the declaration.
  it("beats a contradicting chronotype day part, hour by hour", () => {
    const observed = { peakHours: [15], lowHours: [] };
    expect(energyForHour(15, chronotype, observed)).toBe("peak");
    expect(energyForHour(14, chronotype, observed)).toBe("low");
  });

  // Hour-precise, where the chronotype is a five-bucket day part.
  it("can single out one hour inside a declared day part", () => {
    const observed = { peakHours: [], lowHours: [10] };
    expect(energyForHour(10, chronotype, observed)).toBe("low");
    expect(energyForHour(9, chronotype, observed)).toBe("peak");
  });

  // A peak logged at 02:00 by someone who had a late night is not a slot.
  it("never overrides sleep", () => {
    expect(energyForHour(2, chronotype, { peakHours: [2], lowHours: [] })).toBe("asleep");
  });

  it("falls back to the chronotype when the hour was not observed", () => {
    expect(energyForHour(9, chronotype, { peakHours: [15], lowHours: [] })).toBe("peak");
  });

  it("behaves exactly as before when nothing was observed", () => {
    expect(energyForHour(15, chronotype, { peakHours: [], lowHours: [] })).toBe("low");
    expect(energyForHour(15, chronotype)).toBe("low");
  });

  it("prefers peak when an hour is somehow in both lists", () => {
    expect(energyForHour(12, chronotype, { peakHours: [12], lowHours: [12] })).toBe("peak");
  });
});
