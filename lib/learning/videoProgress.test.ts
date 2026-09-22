import { describe, expect, it } from "vitest";
import { WATCHED_FRACTION, isWatched, parseSavedPosition, resumePoint, videoErrorMessage } from "@/lib/learning/videoProgress";

describe("parseSavedPosition", () => {
  it("accepts a well-formed position", () => {
    expect(parseSavedPosition({ t: 42.5, d: 600 })).toEqual({ t: 42.5, d: 600 });
  });

  it("refuses anything malformed", () => {
    for (const bad of [null, undefined, "x", 3, [], {}, { t: "1", d: 2 }, { t: 1 }, { t: -1, d: 10 }, { t: 1, d: 0 }, { t: NaN, d: 10 }, { t: 1, d: Infinity }]) {
      expect(parseSavedPosition(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("resumePoint", () => {
  it("resumes from a spot in the middle, in whole seconds", () => {
    expect(resumePoint({ t: 123.9, d: 600 })).toBe(123);
  });

  it("does not bother resuming from the very start", () => {
    expect(resumePoint({ t: 0, d: 600 })).toBe(0);
    expect(resumePoint({ t: 4.9, d: 600 })).toBe(0);
    expect(resumePoint({ t: 5, d: 600 })).toBe(5);
  });

  it("does not resume from the last few seconds — that video was finished", () => {
    expect(resumePoint({ t: 595, d: 600 })).toBe(0);
    expect(resumePoint({ t: 589, d: 600 })).toBe(589);
  });

  it("has nothing to resume when nothing was saved", () => {
    expect(resumePoint(null)).toBe(0);
    expect(resumePoint({ t: 30, d: 0 })).toBe(0);
  });
});

describe("videoErrorMessage", () => {
  it("says what actually went wrong for the documented codes", () => {
    expect(videoErrorMessage(101)).toContain("מאפשר");
    expect(videoErrorMessage(150)).toBe(videoErrorMessage(101));
    expect(videoErrorMessage(100)).toContain("הוסר");
    expect(videoErrorMessage(2)).toContain("לא תקין");
    expect(videoErrorMessage(5)).toContain("בדפדפן");
  });

  it("falls back to a general line, never a number, for anything else", () => {
    for (const code of [0, 1, 3, 999, -1, null, undefined]) {
      expect(videoErrorMessage(code), String(code)).toBe("לא הצלחנו לטעון את הנגן.");
    }
  });

  it("gives each distinct failure its own message", () => {
    const messages = new Set([2, 5, 100, 101, 999].map(videoErrorMessage));
    expect(messages.size).toBe(5);
  });
});

describe("isWatched", () => {
  it("counts a video as watched at 90%, not before", () => {
    expect(WATCHED_FRACTION).toBe(0.9);
    expect(isWatched(539, 600)).toBe(false);
    expect(isWatched(540, 600)).toBe(true);
    expect(isWatched(600, 600)).toBe(true);
  });

  it("is never true for a video of unknown length", () => {
    expect(isWatched(50, 0)).toBe(false);
    expect(isWatched(50, -1)).toBe(false);
  });
});
