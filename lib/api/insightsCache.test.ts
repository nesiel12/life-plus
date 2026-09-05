import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dedupedFetch,
  invalidateInsights,
  readCache,
  subscribe,
  writeCache,
  __clearInsightsCache,
} from "@/lib/api/insightsCache";

afterEach(() => __clearInsightsCache());

describe("readCache / writeCache", () => {
  it("returns undefined for a cold key", () => {
    expect(readCache("/a")).toBeUndefined();
  });

  it("round-trips a value", () => {
    writeCache("/a", { events: [1] });
    expect(readCache<{ events: number[] }>("/a")!.value).toEqual({ events: [1] });
  });

  it("keys entries separately", () => {
    writeCache("/a", 1);
    writeCache("/b", 2);
    expect(readCache("/a")!.value).toBe(1);
    expect(readCache("/b")!.value).toBe(2);
  });

  it("stamps when the value was written", () => {
    const before = Date.now();
    writeCache("/a", 1);
    expect(readCache("/a")!.storedAt).toBeGreaterThanOrEqual(before);
  });

  it("caches a falsy value rather than treating it as absent", () => {
    writeCache("/a", null);
    expect(readCache("/a")).toBeDefined();
  });
});

describe("dedupedFetch", () => {
  it("runs the fetcher and caches the result", async () => {
    const fetcher = vi.fn().mockResolvedValue("v");
    await expect(dedupedFetch("/a", fetcher)).resolves.toBe("v");
    expect(readCache("/a")!.value).toBe("v");
  });

  // The case that matters on the dashboard: several cards mount against the
  // same endpoint in one tick and must not open several connections.
  it("collapses concurrent callers onto a single request", async () => {
    let resolve!: (v: string) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<string>((r) => (resolve = r)));

    const a = dedupedFetch("/a", fetcher);
    const b = dedupedFetch("/a", fetcher);
    const c = dedupedFetch("/a", fetcher);
    resolve("v");

    await expect(Promise.all([a, b, c])).resolves.toEqual(["v", "v", "v"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh request once the previous one settled", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    await dedupedFetch("/a", fetcher);
    await expect(dedupedFetch("/a", fetcher)).resolves.toBe("second");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not cache a rejection, and keeps any previous value intact", async () => {
    writeCache("/a", "good");
    const failing = vi.fn().mockRejectedValue(new Error("network down"));
    await expect(dedupedFetch("/a", failing)).rejects.toThrow("network down");
    expect(readCache("/a")!.value).toBe("good");
  });

  it("clears its in-flight marker after a rejection so the next call retries", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("recovered");
    await expect(dedupedFetch("/a", fetcher)).rejects.toThrow();
    await expect(dedupedFetch("/a", fetcher)).resolves.toBe("recovered");
  });
});

// The interleaving the original tests missed. dedupedFetch registers a
// placeholder entry to hold its in-flight promise, and readCache used to
// report that placeholder as a hit — handing callers `undefined`, which
// crashed any consumer reasonably guarding on `data === null`
// (MonthView: "Cannot read properties of undefined (reading 'connected')").
describe("readCache during an in-flight fetch", () => {
  it("reports a MISS on a cold key while the first request is still running", () => {
    let resolve!: (v: string) => void;
    dedupedFetch("/cold", () => new Promise<string>((r) => (resolve = r)));

    expect(readCache("/cold")).toBeUndefined();
    resolve("v");
  });

  it("never hands back undefined as though it were a cached value", async () => {
    let resolve!: (v: { connected: boolean }) => void;
    const pending = dedupedFetch("/cold", () => new Promise<{ connected: boolean }>((r) => (resolve = r)));

    const during = readCache<{ connected: boolean }>("/cold");
    expect(during?.value).toBeUndefined();

    resolve({ connected: true });
    await pending;
    expect(readCache<{ connected: boolean }>("/cold")!.value).toEqual({ connected: true });
  });

  it("keeps serving the previous value while a revalidation is in flight", () => {
    writeCache("/warm", { connected: true });
    let resolve!: (v: unknown) => void;
    dedupedFetch("/warm", () => new Promise((r) => (resolve = r)));

    // Stale-while-revalidate: the old value must stay readable throughout.
    expect(readCache<{ connected: boolean }>("/warm")!.value).toEqual({ connected: true });
    resolve({ connected: false });
  });

  it("still reports a miss after a failed cold fetch, rather than a phantom hit", async () => {
    await expect(dedupedFetch("/cold", () => Promise.reject(new Error("down")))).rejects.toThrow();
    expect(readCache("/cold")).toBeUndefined();
  });
});

describe("subscribe", () => {
  it("notifies listeners when a key is written", () => {
    const listener = vi.fn();
    subscribe("/a", listener);
    writeCache("/a", 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("only notifies listeners of that key", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("/a", a);
    subscribe("/b", b);
    writeCache("/a", 1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const off = subscribe("/a", listener);
    off();
    writeCache("/a", 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("supports several listeners on one key", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribe("/a", a);
    subscribe("/a", b);
    writeCache("/a", 1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateInsights", () => {
  it("drops the key so the next read is cold", () => {
    writeCache("/a", 1);
    invalidateInsights("/a");
    expect(readCache("/a")).toBeUndefined();
  });

  it("notifies listeners so mounted views can react", () => {
    const listener = vi.fn();
    subscribe("/a", listener);
    invalidateInsights("/a");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("leaves other keys alone", () => {
    writeCache("/a", 1);
    writeCache("/b", 2);
    invalidateInsights("/a");
    expect(readCache("/b")!.value).toBe(2);
  });
});
