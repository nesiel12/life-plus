import { describe, expect, it } from "vitest";
import {
  MIN_SAMPLES_FOR_PROFILE,
  MIN_SAMPLES_FOR_ROUTINE,
  buildCheckInProfile,
  energyAdviceForHour,
  shouldPromptCheckIn,
} from "@/lib/checkins/analyze";
import type { CheckIn, CheckInActivity } from "@/types";

let seq = 0;
function at(hour: number, energy: number, activity: CheckInActivity = "work", day = 6): CheckIn {
  return {
    id: `c${seq++}`,
    occurredAt: new Date(2026, 8, day, hour, 0).toISOString(),
    activity,
    energy,
  };
}

/** n check-ins in the same hour, so a routine clears the evidence bar. */
function repeated(hour: number, energy: number, activity: CheckInActivity, n: number): CheckIn[] {
  return Array.from({ length: n }, (_, i) => at(hour, energy, activity, i + 1));
}

describe("buildCheckInProfile", () => {
  it("reports nothing for no check-ins", () => {
    const profile = buildCheckInProfile([]);
    expect(profile.totalSamples).toBe(0);
    expect(profile.averageEnergy).toBeNull();
    expect(profile.hasEnoughData).toBe(false);
    expect(profile.peakHours).toEqual([]);
    expect(profile.activityMix).toEqual([]);
  });

  it("always returns 24 hour slots, empty ones included", () => {
    const profile = buildCheckInProfile([at(9, 4)]);
    expect(profile.hours).toHaveLength(24);
    expect(profile.hours[0]).toMatchObject({ samples: 0, averageEnergy: null, topActivity: null });
    expect(profile.hours.map((h) => h.hour)).toEqual([...Array(24).keys()]);
  });

  it("buckets by the local hour of occurredAt", () => {
    const profile = buildCheckInProfile([at(9, 4), at(9, 2), at(14, 5)]);
    expect(profile.hours[9].samples).toBe(2);
    expect(profile.hours[9].averageEnergy).toBe(3);
    expect(profile.hours[14].samples).toBe(1);
  });

  it("averages overall energy", () => {
    expect(buildCheckInProfile([at(9, 1), at(10, 5)]).averageEnergy).toBe(3);
  });

  it("skips an unparseable timestamp rather than throwing", () => {
    const bad = { ...at(9, 4), occurredAt: "not a date" };
    const profile = buildCheckInProfile([bad, at(10, 4)]);
    expect(profile.totalSamples).toBe(1);
  });

  describe("dominant activity", () => {
    it("names the most frequent one in an hour and its share", () => {
      const profile = buildCheckInProfile([
        at(9, 4, "work", 1),
        at(9, 4, "work", 2),
        at(9, 4, "study", 3),
      ]);
      expect(profile.hours[9].topActivity).toBe("work");
      expect(profile.hours[9].topActivityShare).toBeCloseTo(2 / 3, 5);
    });

    // A 50/50 hour must not read as a confident routine.
    it("reports a tied hour with a share of 0.5", () => {
      const profile = buildCheckInProfile([at(9, 4, "work", 1), at(9, 4, "rest", 2)]);
      expect(profile.hours[9].topActivityShare).toBe(0.5);
    });

    it("ranks the overall activity mix by count", () => {
      const profile = buildCheckInProfile([
        at(9, 4, "work", 1),
        at(10, 4, "work", 2),
        at(11, 4, "rest", 3),
      ]);
      expect(profile.activityMix[0]).toMatchObject({ activity: "work", count: 2 });
      expect(profile.activityMix[0].share).toBeCloseTo(2 / 3, 5);
    });
  });

  describe("evidence thresholds", () => {
    // The rule the whole module is built around: thin evidence is not a
    // finding. Two samples do not establish a routine.
    it("does not call an hour a peak on too few samples", () => {
      const profile = buildCheckInProfile(repeated(9, 5, "work", MIN_SAMPLES_FOR_ROUTINE - 1));
      expect(profile.peakHours).toEqual([]);
    });

    it("calls it a peak once the evidence clears the bar", () => {
      const profile = buildCheckInProfile(repeated(9, 5, "work", MIN_SAMPLES_FOR_ROUTINE));
      expect(profile.peakHours).toEqual([9]);
    });

    it("identifies a reliable trough", () => {
      const profile = buildCheckInProfile(repeated(15, 2, "rest", MIN_SAMPLES_FOR_ROUTINE));
      expect(profile.lowHours).toEqual([15]);
    });

    it("calls a middling hour neither a peak nor a trough", () => {
      const profile = buildCheckInProfile(repeated(12, 3, "work", MIN_SAMPLES_FOR_ROUTINE));
      expect(profile.peakHours).toEqual([]);
      expect(profile.lowHours).toEqual([]);
    });

    it("withholds the whole profile below the overall minimum", () => {
      const profile = buildCheckInProfile(
        Array.from({ length: MIN_SAMPLES_FOR_PROFILE - 1 }, (_, i) => at(9 + i, 4))
      );
      expect(profile.hasEnoughData).toBe(false);
    });

    it("releases it at the minimum", () => {
      const profile = buildCheckInProfile(
        Array.from({ length: MIN_SAMPLES_FOR_PROFILE }, (_, i) => at(9 + i, 4))
      );
      expect(profile.hasEnoughData).toBe(true);
    });
  });

  it("does not mutate the input", () => {
    const input = [at(9, 4), at(10, 3)];
    const snapshot = JSON.stringify(input);
    buildCheckInProfile(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("shouldPromptCheckIn", () => {
  const noon = new Date(2026, 8, 6, 12, 0);

  it("prompts when there has never been one", () => {
    expect(shouldPromptCheckIn({ lastCheckInAt: null, now: noon, intervalHours: 3 })).toBe(true);
  });

  it("waits until the interval has elapsed", () => {
    const oneHourAgo = new Date(2026, 8, 6, 11, 0).toISOString();
    expect(shouldPromptCheckIn({ lastCheckInAt: oneHourAgo, now: noon, intervalHours: 3 })).toBe(false);
  });

  it("prompts once it has", () => {
    const fourHoursAgo = new Date(2026, 8, 6, 8, 0).toISOString();
    expect(shouldPromptCheckIn({ lastCheckInAt: fourHoursAgo, now: noon, intervalHours: 3 })).toBe(true);
  });

  it("prompts exactly at the interval", () => {
    const threeHoursAgo = new Date(2026, 8, 6, 9, 0).toISOString();
    expect(shouldPromptCheckIn({ lastCheckInAt: threeHoursAgo, now: noon, intervalHours: 3 })).toBe(true);
  });

  describe("waking hours", () => {
    // A check-in prompt at 04:00 teaches the user to dismiss the widget.
    it("never prompts before the waking window", () => {
      const dawn = new Date(2026, 8, 6, 4, 0);
      expect(shouldPromptCheckIn({ lastCheckInAt: null, now: dawn, intervalHours: 3 })).toBe(false);
    });

    it("never prompts after it", () => {
      const lateNight = new Date(2026, 8, 6, 23, 30);
      expect(shouldPromptCheckIn({ lastCheckInAt: null, now: lateNight, intervalHours: 3 })).toBe(false);
    });

    it("prompts on the opening hour of the window", () => {
      const eight = new Date(2026, 8, 6, 8, 0);
      expect(shouldPromptCheckIn({ lastCheckInAt: null, now: eight, intervalHours: 3 })).toBe(true);
    });

    it("respects a custom window", () => {
      const six = new Date(2026, 8, 6, 6, 0);
      expect(
        shouldPromptCheckIn({ lastCheckInAt: null, now: six, intervalHours: 3, wakingFrom: 5, wakingTo: 22 })
      ).toBe(true);
    });
  });

  describe("bad input", () => {
    it("prompts on an unparseable last timestamp rather than never again", () => {
      expect(shouldPromptCheckIn({ lastCheckInAt: "garbage", now: noon, intervalHours: 3 })).toBe(true);
    });

    // A clock change must not produce a prompt loop.
    it("holds off when the last check-in is in the future", () => {
      const later = new Date(2026, 8, 6, 18, 0).toISOString();
      expect(shouldPromptCheckIn({ lastCheckInAt: later, now: noon, intervalHours: 3 })).toBe(false);
    });
  });
});

describe("energyAdviceForHour", () => {
  it("is null for an hour with no data", () => {
    expect(energyAdviceForHour(buildCheckInProfile([]), 9)).toBeNull();
  });

  // A hint from one observation reads exactly like a confident one.
  it("is null for a thinly sampled hour", () => {
    const profile = buildCheckInProfile(repeated(9, 5, "work", MIN_SAMPLES_FOR_ROUTINE - 1));
    expect(energyAdviceForHour(profile, 9)).toBeNull();
  });

  it("reports a peak with the evidence behind it", () => {
    const profile = buildCheckInProfile(repeated(9, 5, "work", 4));
    expect(energyAdviceForHour(profile, 9)).toEqual({ level: "peak", samples: 4 });
  });

  it("reports a low hour", () => {
    const profile = buildCheckInProfile(repeated(15, 2, "rest", 3));
    expect(energyAdviceForHour(profile, 15)?.level).toBe("low");
  });

  it("reports a typical hour", () => {
    const profile = buildCheckInProfile(repeated(12, 3, "work", 3));
    expect(energyAdviceForHour(profile, 12)?.level).toBe("typical");
  });

  it("is null for an hour outside 0-23 rather than throwing", () => {
    const profile = buildCheckInProfile(repeated(9, 5, "work", 4));
    expect(energyAdviceForHour(profile, 30)).toBeNull();
    expect(energyAdviceForHour(profile, -1)).toBeNull();
  });
});
