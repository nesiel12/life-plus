import { describe, expect, it } from "vitest";
import { createFanOutBudget } from "@/lib/ai/fanOut";

// The ceiling on model calls within a single request. photos/memories loops
// over the user's photos and captions each one, so without this the cost of
// one click scales with how much data they have.

describe("createFanOutBudget", () => {
  it("allows exactly the ceiling, then stops", () => {
    const b = createFanOutBudget(3);
    expect([b.take(), b.take(), b.take()]).toEqual([true, true, true]);
    expect(b.take()).toBe(false);
  });

  it("reports what is left", () => {
    const b = createFanOutBudget(2);
    expect(b.remaining).toBe(2);
    b.take();
    expect(b.remaining).toBe(1);
    b.take();
    expect(b.remaining).toBe(0);
  });

  it("stays refused once exhausted, however many times it is asked", () => {
    const b = createFanOutBudget(1);
    b.take();
    expect([b.take(), b.take(), b.take()]).toEqual([false, false, false]);
    expect(b.remaining).toBe(0);
  });

  // A nonsense ceiling must mean "none", never "unlimited": the failure mode
  // of this particular guard is spending money.
  describe("a nonsense ceiling refuses everything", () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      it(`${String(bad)} allows no calls`, () => {
        expect(createFanOutBudget(bad).take()).toBe(false);
      });
    }
  });

  it("truncates a fractional ceiling rather than rounding up", () => {
    const b = createFanOutBudget(2.9);
    expect([b.take(), b.take()]).toEqual([true, true]);
    expect(b.take()).toBe(false);
  });

  it("bounds a loop regardless of how many items it runs over", () => {
    const b = createFanOutBudget(3);
    const calls = Array.from({ length: 500 }, () => b.take()).filter(Boolean);
    expect(calls).toHaveLength(3);
  });
});
