import { describe, expect, it, vi } from "vitest";
import { retryImport } from "./dynamicImport";

// Real timers, deliberately: the retry loop's own setTimeout wrapped in a
// promise chain is finicky with vi.useFakeTimers (spurious unhandled-
// rejection noise from the race between the timer and the mock's own
// rejection). The whole suite costs under a second of real wall time.

describe("retryImport", () => {
  it("returns the result directly when the first attempt succeeds — no extra calls", async () => {
    const load = vi.fn().mockResolvedValue({ default: "ok" });
    await expect(retryImport(load)).resolves.toEqual({ default: "ok" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and succeeds once it recovers", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("ChunkLoadError")).mockResolvedValueOnce({ default: "ok" });
    await expect(retryImport(load, 2)).resolves.toEqual({ default: "ok" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured number of retries and throws the last error", async () => {
    const load = vi.fn().mockRejectedValue(new Error("still stale"));
    await expect(retryImport(load, 2)).rejects.toThrow("still stale");
    expect(load).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("defaults to 2 retries when none is given", async () => {
    const load = vi.fn().mockRejectedValue(new Error("x"));
    await expect(retryImport(load)).rejects.toThrow("x");
    expect(load).toHaveBeenCalledTimes(3);
  });
});
