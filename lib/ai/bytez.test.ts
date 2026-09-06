import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// callBytez's shaping is the load-bearing part of this file: every failure
// has to come out matching the exact convention lib/ai/retryableError.ts
// already reads from every other provider (a `.status` on the thrown
// Error), or Bytez failures silently stop participating in the shared
// retry logic instead of a single line of Bytez-specific code being added
// to it.

const originalFetch = global.fetch;

function mockFetch(response: { ok: boolean; status?: number; statusText?: string; body: string }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    statusText: response.statusText ?? "",
    text: () => Promise.resolve(response.body),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.stubEnv("BYTEZ_API_KEY", "test-key");
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("bytezGenerateText", () => {
  it("returns the model's text on success", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: "שלום" }) });
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const text = await bytezGenerateText({ modelId: "google/gemma-3-4b-it", system: "s", prompt: "p" });
    expect(text).toBe("שלום");
  });

  it("reads output.content when output is not a bare string", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: { content: "תשובה" } }) });
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    expect(await bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).toBe("תשובה");
  });

  it("reads output.text as a fallback field name", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: { text: "אחר" } }) });
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    expect(await bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).toBe("אחר");
  });

  it("sends messages and the Authorization header the docs specify", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: "ok" }) });
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    await bytezGenerateText({ modelId: "google/gemma-3-4b-it", system: "sys", prompt: "usr" });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.bytez.com/models/v2/google/gemma-3-4b-it");
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ]);
  });

  describe("failure shaping — must match retryableError.ts's expectations", () => {
    it("attaches the HTTP status to the thrown error on a non-2xx response", async () => {
      mockFetch({ ok: false, status: 429, body: "Too Many Requests" });
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      await expect(bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).rejects.toMatchObject({
        status: 429,
      });
    });

    it("attaches a 5xx status the same way", async () => {
      mockFetch({ ok: false, status: 503, body: "overloaded" });
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      await expect(bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).rejects.toMatchObject({
        status: 503,
      });
    });

    // Bytez's own SDK convention reports some failures as { error, output }
    // at HTTP 200 rather than a non-2xx status.
    it("throws on a 200 response that carries an error field", async () => {
      mockFetch({ ok: true, body: JSON.stringify({ error: "insufficient_quota" }) });
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      await expect(bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).rejects.toThrow(
        "insufficient_quota"
      );
    });

    it("throws with no .status on a missing API key, so it is never retried", async () => {
      vi.unstubAllEnvs(); // no BYTEZ_API_KEY
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      const err = await bytezGenerateText({ modelId: "m", system: "s", prompt: "p" }).catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as { status?: number }).status).toBeUndefined();
    });

    it("throws a readable error on a non-JSON body", async () => {
      mockFetch({ ok: true, body: "<html>not json</html>" });
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      await expect(bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).rejects.toThrow(/non-JSON/);
    });

    it("throws on a response shape with no recognisable text field", async () => {
      mockFetch({ ok: true, body: JSON.stringify({ output: 42 }) });
      const { bytezGenerateText } = await import("@/lib/ai/bytez");
      await expect(bytezGenerateText({ modelId: "m", system: "s", prompt: "p" })).rejects.toThrow(/unexpected/);
    });
  });
});

describe("bytezGenerateObject", () => {
  const schema = z.object({ title: z.string(), count: z.number() });

  it("parses a clean JSON reply against the schema", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: '{"title":"כותרת","count":3}' }) });
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    const result = await bytezGenerateObject({ modelId: "m", system: "s", prompt: "p", schema });
    expect(result).toEqual({ title: "כותרת", count: 3 });
  });

  it("strips a ```json fence before parsing", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: '```json\n{"title":"x","count":1}\n```' }) });
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    expect(await bytezGenerateObject({ modelId: "m", system: "s", prompt: "p", schema })).toEqual({
      title: "x",
      count: 1,
    });
  });

  it("strips a bare ``` fence with no language tag", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: '```\n{"title":"y","count":2}\n```' }) });
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    expect(await bytezGenerateObject({ modelId: "m", system: "s", prompt: "p", schema })).toEqual({
      title: "y",
      count: 2,
    });
  });

  // The whole reason this is not retried within the fallback chain: it is
  // a correctness failure specific to this one model, not a capacity error.
  it("throws with no .status when the reply is not valid JSON at all", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: "I cannot help with that." }) });
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    const err = await bytezGenerateObject({ modelId: "m", system: "s", prompt: "p", schema }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as { status?: number }).status).toBeUndefined();
  });

  it("throws when the JSON is valid but does not satisfy the schema", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: '{"title":"x"}' }) }); // missing count
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    await expect(bytezGenerateObject({ modelId: "m", system: "s", prompt: "p", schema })).rejects.toThrow();
  });

  it("asks for JSON-only output in the system prompt sent to Bytez", async () => {
    mockFetch({ ok: true, body: JSON.stringify({ output: '{"title":"x","count":1}' }) });
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    await bytezGenerateObject({ modelId: "m", system: "base system", prompt: "p", schema });

    const init = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].content).toContain("base system");
    expect(body.messages[0].content).toContain("JSON");
  });
});
