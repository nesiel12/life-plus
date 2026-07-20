import { describe, expect, it } from "vitest";
import { daysUntil, daysSince, daysUntilNextBirthday } from "@/lib/utils";

describe("daysUntil", () => {
  it("returns 0 for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysUntil(today)).toBe(0);
  });

  it("returns a positive count for a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(future.toISOString().slice(0, 10))).toBe(5);
  });

  it("returns a negative count for a past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(daysUntil(past.toISOString().slice(0, 10))).toBe(-3);
  });
});

describe("daysSince", () => {
  it("is the inverse of daysUntil", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const iso = future.toISOString().slice(0, 10);
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
