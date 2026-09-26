import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/components/features/learning/classroom/ClassroomViewport", () => ({}));
const { prefetchLesson } = await import("./lessonPrefetch");
const { lessonQueryKey } = await import("@/lib/query/aiContentKeys");

describe("prefetchLesson", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("only ever reads the server cache — a hover never starts a generation", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "Not cached" }), { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("localStorage", { getItem: () => null });
    const client = new QueryClient();

    prefetchLesson(client, "topic-1", "step-1");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit | undefined];
    expect(init?.method ?? "GET").toBe("GET");
    expect(url).toContain("/api/learning/lesson/generate?");
    expect(url).toContain("userAgeGroup=ADULTS_19_PLUS");
    expect(url).toContain("teachingMode=STORYTELLING");
    await vi.waitFor(() => expect(client.getQueryState(lessonQueryKey("topic-1", "step-1", "ADULTS_19_PLUS", "STORYTELLING"))?.status).toBe("error"));
    expect(client.getQueryData(lessonQueryKey("topic-1", "step-1", "ADULTS_19_PLUS", "STORYTELLING"))).toBeUndefined();
  });

  it("puts a cached lesson under the exact key the classroom reads, using the remembered pickers", async () => {
    const content = { originStory: "o" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content, cached: true }), { status: 200 })));
    vi.stubGlobal("localStorage", { getItem: (k: string) => (k.endsWith("ageGroup") ? "TEENS_13_18" : "SOCRATIC") });
    const client = new QueryClient();

    prefetchLesson(client, "topic-1", "step-1");
    await vi.waitFor(() => expect(client.getQueryData(lessonQueryKey("topic-1", "step-1", "TEENS_13_18", "SOCRATIC"))).toEqual(content));
  });
});
