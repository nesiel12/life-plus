import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { lessonQueryKey, stepBriefQueryKey } from "@/lib/query/offlineKeys";

function sseResponse(events: { event: string; data: unknown }[]): Response {
  const body = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join("");
  return new Response(body, { status: 200 });
}

describe("isResourceDownloaded", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false until both the brief and the lesson are cached", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const { isResourceDownloaded } = await import("./downloadResource");
    const client = new QueryClient();
    expect(isResourceDownloaded(client, "t1", "s1")).toBe(false);
    client.setQueryData(stepBriefQueryKey("s1"), { summary: "x" });
    expect(isResourceDownloaded(client, "t1", "s1")).toBe(false);
    client.setQueryData(lessonQueryKey("t1", "s1", "ADULTS_19_PLUS", "STORYTELLING"), { originStory: "x" });
    expect(isResourceDownloaded(client, "t1", "s1")).toBe(true);
  });

  it("checks the lesson under this device's actual remembered picker, not a fixed default", async () => {
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k.endsWith("ageGroup") ? "TEENS_13_18" : "SOCRATIC") });
    const { isResourceDownloaded } = await import("./downloadResource");
    const client = new QueryClient();
    client.setQueryData(stepBriefQueryKey("s1"), { summary: "x" });
    client.setQueryData(lessonQueryKey("t1", "s1", "ADULTS_19_PLUS", "STORYTELLING"), { originStory: "wrong variant" });
    expect(isResourceDownloaded(client, "t1", "s1")).toBe(false);
    client.setQueryData(lessonQueryKey("t1", "s1", "TEENS_13_18", "SOCRATIC"), { originStory: "right variant" });
    expect(isResourceDownloaded(client, "t1", "s1")).toBe(true);
  });
});

describe("downloadResourceForOffline", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("generates and caches both halves on a full miss", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("step-content")) return sseResponse([{ event: "done", data: { content: { summary: "brief" }, cached: false } }]);
      return sseResponse([{ event: "done", data: { content: { originStory: "lesson" }, cached: false } }]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { downloadResourceForOffline } = await import("./downloadResource");
    const client = new QueryClient();
    await downloadResourceForOffline(client, "t1", "s1");
    expect(client.getQueryData(stepBriefQueryKey("s1"))).toEqual({ summary: "brief" });
    expect(client.getQueryData(lessonQueryKey("t1", "s1", "ADULTS_19_PLUS", "STORYTELLING"))).toEqual({ originStory: "lesson" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not re-generate a half that is already cached", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    const fetchMock = vi.fn(async () => sseResponse([{ event: "done", data: { content: { originStory: "lesson" }, cached: false } }]));
    vi.stubGlobal("fetch", fetchMock);
    const { downloadResourceForOffline } = await import("./downloadResource");
    const client = new QueryClient();
    client.setQueryData(stepBriefQueryKey("s1"), { summary: "already here" });
    await downloadResourceForOffline(client, "t1", "s1");
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the lesson
    expect(client.getQueryData(stepBriefQueryKey("s1"))).toEqual({ summary: "already here" });
  });

  it("rejects when the stream reports an error, leaving nothing cached", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("step-content")
          ? sseResponse([{ event: "error", data: { error: "quota exceeded" } }])
          : sseResponse([{ event: "done", data: { content: { originStory: "lesson" }, cached: false } }])
      )
    );
    const { downloadResourceForOffline } = await import("./downloadResource");
    const client = new QueryClient();
    await expect(downloadResourceForOffline(client, "t1", "s1")).rejects.toThrow();
    expect(client.getQueryData(stepBriefQueryKey("s1"))).toBeUndefined();
  });

  it("rejects on a non-2xx response instead of silently caching nothing", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "not cached" }), { status: 500 })));
    const { downloadResourceForOffline } = await import("./downloadResource");
    const client = new QueryClient();
    await expect(downloadResourceForOffline(client, "t1", "s1")).rejects.toThrow();
  });
});
