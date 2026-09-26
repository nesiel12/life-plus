import { afterEach, describe, expect, it, vi } from "vitest";
import { makeQueryClient } from "./queryClient";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

describe("makeQueryClient", () => {
  afterEach(() => vi.useRealTimers());

  it("never arms a gc timer that overflows setTimeout (a 30-day gcTime collects instantly)", () => {
    const gcTime = makeQueryClient().getDefaultOptions().queries?.gcTime;
    expect(gcTime === Infinity || (typeof gcTime === "number" && gcTime <= MAX_TIMEOUT_MS)).toBe(true);
  });

  it("keeps an unobserved AI result in memory so it can be persisted", async () => {
    vi.useFakeTimers();
    const client = makeQueryClient();
    client.setQueryData(["ai-content", "lesson", "t", "s", "ADULTS_19_PLUS", "STORYTELLING"], { originStory: "o" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.getQueryData(["ai-content", "lesson", "t", "s", "ADULTS_19_PLUS", "STORYTELLING"])).toEqual({ originStory: "o" });
  });
});
