import { describe, expect, it } from "vitest";
import { daysUntil, daysSince, daysUntilNextBirthday } from "@/lib/utils";

// daysUntil/daysSince compare against *local* "today" (lib/utils.ts's own
// startOfDay). Building a fixture with toISOString() serializes in UTC,
// which silently picks the wrong calendar day whenever the test runs near
// local midnight in a positive UTC-offset timezone — a real, previously
// flaky bug in this file, not in daysUntil itself. Local date components
// keep the fixture and the function comparing the same calendar day.
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    expect(daysUntil(toLocalDateString(new Date()))).toBe(0);
  });

  it("returns a positive count for a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(toLocalDateString(future))).toBe(5);
  });

  it("returns a negative count for a past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(daysUntil(toLocalDateString(past))).toBe(-3);
  });
});

describe("daysSince", () => {
  it("is the inverse of daysUntil", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const iso = toLocalDateString(future);
    expect(daysSince(iso)).toBe(-daysUntil(iso));
  });
});

describe("daysUntilNextBirthday", () => {
  it("returns null for malformed input", () => {
    expect(daysUntilNextBirthday("")).toBeNull();
    expect(daysUntilNextBirthday("garbage")).toBeNull();
  });

  it("returns 0 when today is the birthday", () => {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(daysUntilNextBirthday(mmdd)).toBe(0);
  });

  it("rolls over to next year when the birthday already passed this year", () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const mmdd = `${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    const result = daysUntilNextBirthday(mmdd);
    expect(result).not.toBeNull();
    expect(result as number).toBeGreaterThan(300);
  });
});
