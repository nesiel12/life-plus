import { describe, expect, it, vi } from "vitest";
import { fetchVideoMeta, parseOembed } from "@/lib/learning/youtubeOembed";

describe("parseOembed", () => {
  it("reads the title and author", () => {
    expect(parseOembed({ title: "  Deep   Dive ", author_name: "Some Channel" })).toEqual({ title: "Deep Dive", author: "Some Channel" });
  });

  it("treats a missing author as null", () => {
    expect(parseOembed({ title: "T" })).toEqual({ title: "T", author: null });
    expect(parseOembed({ title: "T", author_name: "   " })).toEqual({ title: "T", author: null });
  });

  it("refuses anything without a usable title", () => {
    for (const bad of [null, undefined, "x", 5, [], {}, { title: 7 }, { title: "   " }]) {
      expect(parseOembed(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("clips an enormous title", () => {
    const meta = parseOembed({ title: "א".repeat(500) })!;
    expect(meta.title.length).toBeLessThanOrEqual(120);
    expect(meta.title.endsWith("…")).toBe(true);
  });
});

describe("fetchVideoMeta", () => {
  const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

  it("asks oEmbed about the watch URL and returns the parsed meta", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ title: "T", author_name: "A" }));
    expect(await fetchVideoMeta("dQw4w9WgXcQ", { fetchImpl })).toEqual({ title: "T", author: "A" });
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain("https://www.youtube.com/oembed?url=");
    expect(decodeURIComponent(url)).toContain("watch?v=dQw4w9WgXcQ");
  });

  it("returns null instead of throwing when the request fails, is refused, or is not JSON", async () => {
    expect(await fetchVideoMeta("dQw4w9WgXcQ", { fetchImpl: vi.fn().mockRejectedValue(new Error("offline")) })).toBeNull();
    expect(await fetchVideoMeta("dQw4w9WgXcQ", { fetchImpl: vi.fn().mockResolvedValue(json({}, false)) })).toBeNull();
    const badJson = { ok: true, json: async () => { throw new Error("bad"); } } as unknown as Response;
    expect(await fetchVideoMeta("dQw4w9WgXcQ", { fetchImpl: vi.fn().mockResolvedValue(badJson) })).toBeNull();
  });
});
