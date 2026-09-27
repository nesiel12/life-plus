import { afterEach, describe, expect, it, vi } from "vitest";
import { __clearInsightsCache, readCache } from "@/lib/api/insightsCache";
import { STATIC_INSIGHT_URLS, warmInsightsCache } from "./warmInsights";

describe("warmInsightsCache", () => {
  afterEach(() => {
    __clearInsightsCache();
    vi.unstubAllGlobals();
  });

  it("fetches every static insight URL exactly once and lands it in the shared cache useInsights reads", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ url }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    warmInsightsCache();
    await vi.waitFor(() => {
      for (const url of STATIC_INSIGHT_URLS) expect(readCache(url)).toBeDefined();
    });

    expect(fetchMock).toHaveBeenCalledTimes(STATIC_INSIGHT_URLS.length);
    for (const url of STATIC_INSIGHT_URLS) expect(readCache(url)?.value).toEqual({ url });
  });

  it("skips a URL the current page's own widgets already fetched, instead of firing a redundant duplicate", async () => {
    const { writeCache } = await import("@/lib/api/insightsCache");
    writeCache(STATIC_INSIGHT_URLS[0], { already: "here" });
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify({ url }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    warmInsightsCache();
    await vi.waitFor(() => {
      for (const url of STATIC_INSIGHT_URLS.slice(1)) expect(readCache(url)).toBeDefined();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(STATIC_INSIGHT_URLS[0]);
    expect(fetchMock).toHaveBeenCalledTimes(STATIC_INSIGHT_URLS.length - 1);
    expect(readCache(STATIC_INSIGHT_URLS[0])?.value).toEqual({ already: "here" });
  });

  it("never throws or rejects when a request fails — a screen's own useInsights just fetches for real", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 }))
    );
    expect(() => warmInsightsCache()).not.toThrow();
    await new Promise((r) => setTimeout(r, 20));
    for (const url of STATIC_INSIGHT_URLS) expect(readCache(url)).toBeUndefined();
  });
});
