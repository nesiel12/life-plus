import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearCache, cached, invalidate, invalidatePrefix } from "@/lib/api/ttlCache";

afterEach(() => {
  __clearCache();
  vi.useRealTimers();
});

const TTL = 60_000;

describe("cached", () => {
  it("runs the fetcher once and serves the cached value within the TTL", async () => {
    const fetcher = vi.fn().mockResolvedValue("value");

    expect(await cached("k", TTL, fetcher)).toBe("value");
    expect(await cached("k", TTL, fetcher)).toBe("value");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("re-runs the fetcher once the entry has expired", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    expect(await cached("k", TTL, fetcher)).toBe("first");
    vi.advanceTimersByTime(TTL + 1);
    expect(await cached("k", TTL, fetcher)).toBe("second");
  });

  it("never caches a rejection", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");

    await expect(cached("k", TTL, fetcher)).rejects.toThrow("boom");
    // A transient Google failure must not be pinned in front of the user for
    // the whole TTL.
    expect(await cached("k", TTL, fetcher)).toBe("ok");
  });
});

describe("invalidate", () => {
  it("drops exactly the named key", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    await cached("a", TTL, fetcher);
    await cached("b", TTL, fetcher);

    invalidate("a");

    await cached("a", TTL, fetcher);
    await cached("b", TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(3); // a, b, a again — b still cached
  });
});

describe("invalidatePrefix", () => {
  it("drops every key under the prefix and leaves the rest cached", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    // The shape the day/week grids actually cache under: one entry per
    // window, which the writer cannot enumerate to invalidate by exact key.
    await cached("calendar-range:me@x.com:2026-03-01:2026-03-02", TTL, fetcher);
    await cached("calendar-range:me@x.com:2026-03-08:2026-03-15", TTL, fetcher);
    await cached("calendar-range:other@x.com:2026-03-01:2026-03-02", TTL, fetcher);
    await cached("calendar-month:me@x.com:2026-03", TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(4);

    invalidatePrefix("calendar-range:me@x.com");

    await cached("calendar-range:me@x.com:2026-03-01:2026-03-02", TTL, fetcher);
    await cached("calendar-range:me@x.com:2026-03-08:2026-03-15", TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(6); // both windows refetched

    // Another user's cache and this user's other scopes are untouched.
    await cached("calendar-range:other@x.com:2026-03-01:2026-03-02", TTL, fetcher);
    await cached("calendar-month:me@x.com:2026-03", TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("is a no-op when nothing matches", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    await cached("calendar-month:me@x.com:2026-03", TTL, fetcher);

    invalidatePrefix("calendar-range:me@x.com");

    await cached("calendar-month:me@x.com:2026-03", TTL, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
