import { describe, expect, it } from "vitest";
import {
  DAY_PARTS,
  dayPartLabel,
  dayPartLabels,
  isDayPart,
  summarizePeakFocus,
  summarizeSleep,
} from "@/lib/onboarding/chronotype";

describe("dayPartLabel", () => {
  it("resolves every key in the vocabulary", () => {
    for (const part of DAY_PARTS) {
      expect(dayPartLabel(part.key)).toBe(part.label);
    }
  });

  it("joins several parts in the order given", () => {
    expect(dayPartLabels(["morning", "night"])).toBe("בוקר, לילה");
  });
});

describe("isDayPart", () => {
  it("accepts known keys and rejects everything else", () => {
    expect(isDayPart("morning")).toBe(true);
    expect(isDayPart("brunch")).toBe(false);
    expect(isDayPart(3)).toBe(false);
    expect(isDayPart(null)).toBe(false);
    expect(isDayPart(undefined)).toBe(false);
  });
});

describe("summarizePeakFocus", () => {
  // personal_dna.peak_focus_hours feeds the AI signal pipeline and two UI
  // surfaces. Returning undefined (rather than "") matters: toPersonalDnaPatch
  // only writes keys that are defined, so an empty answer must leave whatever
  // the conversational onboarding already collected untouched.
  it("is undefined when nothing was chosen", () => {
    expect(summarizePeakFocus({})).toBeUndefined();
    expect(summarizePeakFocus({ peakFocusHours: [] })).toBeUndefined();
  });

  it("renders the chosen windows as readable Hebrew", () => {
    expect(summarizePeakFocus({ peakFocusHours: ["earlyMorning", "morning"] })).toBe(
      "בוקר מוקדם, בוקר"
    );
  });
});

describe("summarizeSleep", () => {
  it("is undefined when neither time was given", () => {
    expect(summarizeSleep({})).toBeUndefined();
  });

  it("renders both times together", () => {
    expect(summarizeSleep({ wakeTime: "06:30", sleepTime: "23:00" })).toBe("שינה 23:00, קימה 06:30");
  });

  it("renders a single time on its own rather than a half-empty sentence", () => {
    expect(summarizeSleep({ wakeTime: "06:30" })).toBe("קימה 06:30");
    expect(summarizeSleep({ sleepTime: "23:00" })).toBe("שינה 23:00");
  });
});
