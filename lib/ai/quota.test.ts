import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_REQUESTS_PER_DAY,
  DEFAULT_REQUESTS_PER_MINUTE,
  DEFAULT_TRANSCRIPTION_MINUTES_PER_DAY,
  actualAudioMinutes,
  budgetsFor,
  dayWindow,
  estimatedAudioMinutes,
  minuteWindow,
  quotaLimits,
  quotaMessage,
  resetAt,
  unitCost,
} from "@/lib/ai/quota";

const ENV_KEYS = [
  "FREE_AI_REQUESTS_PER_DAY",
  "FREE_AI_TRANSCRIPTION_MINUTES_PER_DAY",
  "FREE_AI_REQUESTS_PER_MINUTE",
] as const;

const saved: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("unitCost", () => {
  it("charges a plain call one unit", () => {
    expect(unitCost("chat")).toBe(1);
    expect(unitCost("structured")).toBe(1);
  });

  // A course module emits several times a chat turn's output, so charging it
  // the same would price the free tier off the cheapest possible request.
  it("charges the heavy generator more", () => {
    expect(unitCost("course_module")).toBeGreaterThan(unitCost("chat"));
  });

  // Transcription is billed in audio minutes against its own budget.
  it("charges transcription nothing in request units", () => {
    expect(unitCost("transcription")).toBe(0);
  });
});

describe("quotaLimits", () => {
  it("falls back to the documented defaults", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(quotaLimits()).toEqual({
      requestsPerDay: DEFAULT_REQUESTS_PER_DAY,
      transcriptionMinutesPerDay: DEFAULT_TRANSCRIPTION_MINUTES_PER_DAY,
      requestsPerMinute: DEFAULT_REQUESTS_PER_MINUTE,
    });
  });

  it("reads overrides from the environment", () => {
    process.env.FREE_AI_REQUESTS_PER_DAY = "5";
    process.env.FREE_AI_TRANSCRIPTION_MINUTES_PER_DAY = "2";
    process.env.FREE_AI_REQUESTS_PER_MINUTE = "1";
    expect(quotaLimits()).toEqual({
      requestsPerDay: 5,
      transcriptionMinutesPerDay: 2,
      requestsPerMinute: 1,
    });
  });

  it("accepts zero as a real value, meaning fully disabled", () => {
    process.env.FREE_AI_REQUESTS_PER_DAY = "0";
    expect(quotaLimits().requestsPerDay).toBe(0);
  });

  // A typo must not silently become 0 and lock every user out of every AI
  // feature — the same fail-closed trap the sign-in allow-list had.
  describe("a malformed value falls back rather than locking users out", () => {
    for (const bad of ["abc", "-5", "1.5", " ", "NaN", "Infinity"]) {
      it(`rejects ${JSON.stringify(bad)}`, () => {
        process.env.FREE_AI_REQUESTS_PER_DAY = bad;
        expect(quotaLimits().requestsPerDay).toBe(DEFAULT_REQUESTS_PER_DAY);
      });
    }
  });
});

describe("windows", () => {
  it("collapses a whole day to one key", () => {
    const morning = new Date(Date.UTC(2026, 8, 6, 1, 5));
    const night = new Date(Date.UTC(2026, 8, 6, 23, 59));
    expect(dayWindow(morning)).toBe(dayWindow(night));
  });

  it("separates adjacent days", () => {
    expect(dayWindow(new Date(Date.UTC(2026, 8, 6, 23, 59)))).not.toBe(
      dayWindow(new Date(Date.UTC(2026, 8, 7, 0, 1)))
    );
  });

  it("collapses a whole minute to one key", () => {
    expect(minuteWindow(new Date(Date.UTC(2026, 8, 6, 10, 30, 1)))).toBe(
      minuteWindow(new Date(Date.UTC(2026, 8, 6, 10, 30, 59)))
    );
  });

  it("separates adjacent minutes", () => {
    expect(minuteWindow(new Date(Date.UTC(2026, 8, 6, 10, 30, 59)))).not.toBe(
      minuteWindow(new Date(Date.UTC(2026, 8, 6, 10, 31, 0)))
    );
  });
});

describe("budgetsFor", () => {
  const limits = { requestsPerDay: 40, transcriptionMinutesPerDay: 10, requestsPerMinute: 6 };
  const at = new Date(Date.UTC(2026, 8, 6, 12, 0));

  it("charges a chat call against the day and the burst budget", () => {
    const budgets = budgetsFor("chat", at, limits);
    expect(budgets.map((b) => b.scope).sort()).toEqual(["day", "minute"]);
    expect(budgets.find((b) => b.scope === "day")).toMatchObject({ cost: 1, limit: 40 });
    expect(budgets.find((b) => b.scope === "minute")).toMatchObject({ cost: 1, limit: 6 });
  });

  it("charges a course module its heavier weight", () => {
    const day = budgetsFor("course_module", at, limits).find((b) => b.scope === "day");
    expect(day?.cost).toBe(3);
  });

  it("routes transcription to its own budget, in minutes", () => {
    const budgets = budgetsFor("transcription", at, limits, 4);
    expect(budgets.map((b) => b.scope).sort()).toEqual(["minute", "transcribe_day"]);
    expect(budgets.find((b) => b.scope === "transcribe_day")).toMatchObject({ cost: 4, limit: 10 });
  });

  it("never charges transcription against the request budget", () => {
    expect(budgetsFor("transcription", at, limits, 4).some((b) => b.scope === "day")).toBe(false);
  });

  // Exempting the most expensive call from the burst cap would be backwards.
  it("still charges transcription against the burst budget", () => {
    expect(budgetsFor("transcription", at, limits, 4).find((b) => b.scope === "minute")?.cost).toBe(1);
  });

  it("never charges less than one audio minute", () => {
    const b = budgetsFor("transcription", at, limits, 0).find((x) => x.scope === "transcribe_day");
    expect(b?.cost).toBe(1);
  });
});

describe("audio minute estimation", () => {
  it("rounds up, so a short clip still costs a minute", () => {
    expect(estimatedAudioMinutes(1)).toBe(1);
    expect(estimatedAudioMinutes(1_200_000)).toBe(2);
  });

  it("scales with file size", () => {
    expect(estimatedAudioMinutes(10_000_000)).toBe(10);
  });

  it("treats nonsense sizes as one minute rather than free", () => {
    expect(estimatedAudioMinutes(0)).toBe(1);
    expect(estimatedAudioMinutes(-5)).toBe(1);
    expect(estimatedAudioMinutes(NaN)).toBe(1);
  });

  it("converts a reported duration to whole minutes, rounded up", () => {
    expect(actualAudioMinutes(61)).toBe(2);
    expect(actualAudioMinutes(60)).toBe(1);
    expect(actualAudioMinutes(1)).toBe(1);
  });

  it("reports null when the model gave no duration, so the estimate stands", () => {
    expect(actualAudioMinutes(undefined)).toBeNull();
    expect(actualAudioMinutes(NaN)).toBeNull();
  });
});

describe("resetAt", () => {
  it("rolls the minute budget at the top of the next minute", () => {
    const at = new Date(Date.UTC(2026, 8, 6, 10, 30, 25));
    expect(resetAt("minute", at).toISOString()).toBe("2026-09-06T10:31:00.000Z");
  });

  it("rolls daily budgets at midnight", () => {
    const at = new Date(Date.UTC(2026, 8, 6, 10, 30));
    expect(resetAt("day", at).toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(resetAt("transcribe_day", at).toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("rolls across a month boundary", () => {
    expect(resetAt("day", new Date(Date.UTC(2026, 8, 30, 12))).toISOString()).toBe(
      "2026-10-01T00:00:00.000Z"
    );
  });
});

describe("quotaMessage", () => {
  const at = new Date(Date.UTC(2026, 8, 6, 12, 0));

  it("tells a throttled user to wait, not that they are out", () => {
    expect(quotaMessage("minute", at)).toContain("דקה");
  });

  it("names transcription specifically when that budget runs out", () => {
    expect(quotaMessage("transcribe_day", at)).toContain("תמלול");
  });

  it("says the daily allowance is spent and when it returns", () => {
    const msg = quotaMessage("day", at);
    expect(msg).toContain("מכסת");
    expect(msg).toContain("מתחדשת");
  });

  // The three cases must not read identically — the whole point is that the
  // user can tell "wait a minute" from "come back tomorrow".
  it("distinguishes the three budgets", () => {
    const msgs = new Set([
      quotaMessage("minute", at),
      quotaMessage("day", at),
      quotaMessage("transcribe_day", at),
    ]);
    expect(msgs.size).toBe(3);
  });
});
