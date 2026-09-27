// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { onIdle } from "./idle";

describe("onIdle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses requestIdleCallback when the browser has it", () => {
    const ric = vi.fn(() => 7);
    const cic = vi.fn();
    vi.stubGlobal("requestIdleCallback", ric);
    vi.stubGlobal("cancelIdleCallback", cic);
    const fn = vi.fn();
    const cancel = onIdle(fn, 3000);
    expect(ric).toHaveBeenCalledWith(fn, { timeout: 3000 });
    cancel();
    expect(cic).toHaveBeenCalledWith(7);
  });

  it("falls back to a capped setTimeout on a browser with no requestIdleCallback (Safari)", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const fn = vi.fn();
    onIdle(fn, 5000);
    vi.advanceTimersByTime(1499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("does nothing outside a browser instead of throwing", () => {
    vi.stubGlobal("window", undefined);
    expect(() => onIdle(() => {})()).not.toThrow();
  });
});
