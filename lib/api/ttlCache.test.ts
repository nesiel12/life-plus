import { afterEach, describe, expect, it, vi } from "vitest";
import { cached, invalidate, __clearCache } from "@/lib/api/ttlCache";

afterEach(() => {
  __clearCache();
  vi.useRealTimers();
});

describe("cached", () => {
  it("runs the fetcher on a miss and returns its value", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");
    await expect(cached("k", 1000, fetcher)).resolves.toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves a second read from cache without calling the fetcher again", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");
    await cached("k", 1000, fetcher);
    await expect(cached("k", 1000, fetcher)).resolves.toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keys entries separately", async () => {
    const a = vi.fn().mockResolvedValue("a");
    const b = vi.fn().mockResolvedValue("b");
    await expect(cached("a", 1000, a)).resolves.toBe("a");
    await expect(cached("b", 1000, b)).resolves.toBe("b");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("re-fetches once the TTL has elapsed", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    await expect(cached("k", 1000, fetcher)).resolves.toBe("first");
    vi.advanceTimersByTime(1001);
    await expect(cached("k", 1000, fetcher)).resolves.toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("still serves from cache just before the TTL elapses", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValue("first");
    await cached("k", 1000, fetcher);
    vi.advanceTimersByTime(999);
    await cached("k", 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  // The important one: a transient upstream failure must not be pinned in
  // front of the user for the whole TTL.
  it("does not cache a rejection", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("upstream down")).mockResolvedValueOnce("recovered");
    await expect(cached("k", 1000, fetcher)).rejects.toThrow("upstream down");
    await expect(cached("k", 1000, fetcher)).resolves.toBe("recovered");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("caches a falsy value rather than treating it as a miss", async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    await cached("k", 1000, fetcher);
    await cached("k", 1000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("invalidate", () => {
  it("forces the next read to re-fetch", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    await cached("k", 10_000, fetcher);
    invalidate("k");
    await expect(cached("k", 10_000, fetcher)).resolves.toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("leaves other keys alone", async () => {
    const other = vi.fn().mockResolvedValue("other");
    await cached("other", 10_000, other);
    invalidate("k");
    await cached("other", 10_000, other);
    expect(other).toHaveBeenCalledTimes(1);
  });
});
