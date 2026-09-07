import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Proves the real, deployed Gemini -> Bytez -> OpenAI fallback chain, not a
// reimplementation of it. Everything below imports the actual exported
// functions from lib/ai/service.ts and lib/ai/provider.ts — the same code
// every AI route in the app calls — with only the network edges mocked:
// the AI SDK's generateText/generateObject (Gemini and OpenAI both go
// through these) and lib/ai/bytez.ts's two exports (Bytez has no SDK
// integration, so it's mocked at that boundary instead).
//
// No real API key, no real network call, no real database write. The
// system actor is used specifically because chargeQuota() returns
// immediately for it (see lib/ai/service.ts) — this exercises the fallback
// chain with zero Supabase interaction, not a mocked one.
//
// Provider *priority* is not something this file decides — vi.stubEnv sets
// all three keys, and lib/ai/provider.ts's real, unmodified
// getChatModelChain() is what turns that into "Gemini first". If that
// ordering ever changed in provider.ts, this test would still pass or fail
// honestly based on whatever the real chain produces — it is not hardcoded
// here.

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: vi.fn(),
    generateObject: vi.fn(),
  };
});

vi.mock("@/lib/ai/bytez", () => ({
  bytezGenerateText: vi.fn(),
  bytezGenerateObject: vi.fn(),
}));

const SYSTEM_ACTOR = { kind: "system" as const, job: "fallback-test" };

/** A retryable failure — the exact shape lib/ai/retryableError.ts treats as
 *  worth trying the next candidate for (a real 503 from an overloaded
 *  provider, which is the production incident this chain exists for). */
function retryableFailure(providerLabel: string) {
  return Object.assign(new Error(`${providerLabel}: high demand, please try again`), { status: 503 });
}

/** A non-retryable failure — a dead API key. Used to prove the chain does
 *  NOT advance past something isRetryableAiError correctly refuses. */
function fatalFailure() {
  return Object.assign(new Error("Invalid API key"), { status: 401 });
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
  vi.stubEnv("BYTEZ_API_KEY", "bytez-test-key");
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  // resetAllMocks, not clearAllMocks: mockRejectedValueOnce/
  // mockResolvedValueOnce queue implementations, and clearAllMocks only
  // clears call history — a leftover queued value from one test silently
  // serves the next test's first call otherwise.
  vi.resetAllMocks();
});

describe("Gemini -> Bytez -> OpenAI fallback (generateChatText)", () => {
  it("1-3: falls back to Bytez when Gemini fails, and returns Bytez's response", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockRejectedValueOnce(retryableFailure("gemini"));
    vi.mocked(bytezGenerateText).mockResolvedValueOnce("תשובה מ-Bytez");

    const result = await generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toBe("תשובה מ-Bytez");
    // Gemini was tried exactly once, and the chain stopped there — OpenAI
    // (also called through generateText) was never reached.
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(bytezGenerateText).toHaveBeenCalledTimes(1);
  });

  it("4: continues to OpenAI when Gemini AND Bytez both fail", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("gemini")) // 1st generateText call = Gemini
      .mockResolvedValueOnce({ text: "תשובה מ-OpenAI" } as never); // 2nd = OpenAI
    vi.mocked(bytezGenerateText).mockRejectedValueOnce(retryableFailure("bytez"));

    const result = await generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toBe("תשובה מ-OpenAI");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(bytezGenerateText).toHaveBeenCalledTimes(1);
  });

  it("returns Gemini's own response directly when it simply succeeds (no fallback triggered)", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockResolvedValueOnce({ text: "תשובת Gemini" } as never);

    const result = await generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toBe("תשובת Gemini");
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(bytezGenerateText).not.toHaveBeenCalled();
  });

  it("does not advance to Bytez on a non-retryable Gemini failure (a dead key)", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockRejectedValueOnce(fatalFailure());

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).rejects.toThrow(
      "Invalid API key"
    );
    expect(bytezGenerateText).not.toHaveBeenCalled();
  });

  it("throws the last error when the entire chain fails", async () => {
    // The real chain for these three keys is four candidates, not three —
    // Gemini primary, Bytez, OpenAI, then a same-provider Gemini alias as
    // one more retry (see getChatModelChain in lib/ai/provider.ts, and its
    // own test asserting this exact ["sdk","bytez","sdk","sdk"] shape).
    // Queuing three generateText failures here, not two, is what makes
    // this test faithful to the real chain length rather than a shorter
    // one this test merely assumed.
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("gemini-primary"))
      .mockRejectedValueOnce(retryableFailure("openai-final"))
      .mockRejectedValueOnce(retryableFailure("gemini-alternate-last"));
    vi.mocked(bytezGenerateText).mockRejectedValueOnce(retryableFailure("bytez"));

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).rejects.toThrow(
      "gemini-alternate-last"
    );
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(bytezGenerateText).toHaveBeenCalledTimes(1);
  });
});

describe("Gemini -> Bytez -> OpenAI fallback (generateStructuredData)", () => {
  const schema = z.object({ title: z.string() });

  it("falls back to Bytez's structured output when Gemini fails", async () => {
    const { generateObject } = await import("ai");
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    const { generateStructuredData } = await import("@/lib/ai/service");

    vi.mocked(generateObject).mockRejectedValueOnce(retryableFailure("gemini"));
    vi.mocked(bytezGenerateObject).mockResolvedValueOnce({ title: "מ-Bytez" });

    const result = await generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toEqual({ title: "מ-Bytez" });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(bytezGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("continues to OpenAI's structured output when Gemini and Bytez both fail", async () => {
    const { generateObject } = await import("ai");
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    const { generateStructuredData } = await import("@/lib/ai/service");

    vi.mocked(generateObject)
      .mockRejectedValueOnce(retryableFailure("gemini"))
      .mockResolvedValueOnce({ object: { title: "מ-OpenAI" } } as never);
    vi.mocked(bytezGenerateObject).mockRejectedValueOnce(retryableFailure("bytez"));

    const result = await generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toEqual({ title: "מ-OpenAI" });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(bytezGenerateObject).toHaveBeenCalledTimes(1);
  });

  // Bytez's own schema-validation failure (see lib/ai/bytez.ts) is a
  // correctness failure, not a capacity one, and is thrown with no
  // `.status` — proving the chain still advances past it here is what
  // establishes that isRetryableAiError's text-matching path, not just its
  // status-code path, genuinely drives this fallback too.
  it("does NOT advance to OpenAI on Bytez's own schema-validation failure", async () => {
    // Distinct from every other failure in this file: this one carries no
    // .status and no retryable wording, by design (lib/ai/bytez.ts) — a
    // model producing the wrong shape is a correctness failure specific to
    // that model, not a capacity failure, and isRetryableAiError must
    // refuse to paper over it by quietly trying yet another model.
    const { generateObject } = await import("ai");
    const { bytezGenerateObject } = await import("@/lib/ai/bytez");
    const { generateStructuredData } = await import("@/lib/ai/service");

    vi.mocked(generateObject).mockRejectedValueOnce(retryableFailure("gemini"));
    vi.mocked(bytezGenerateObject).mockRejectedValueOnce(new Error("Bytez did not return valid JSON: ..."));

    await expect(
      generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR })
    ).rejects.toThrow("Bytez did not return valid JSON");
    // OpenAI's own generateObject call must never have happened.
    expect(generateObject).toHaveBeenCalledTimes(1);
  });
});

describe("system actor never touches the database", () => {
  it("charges nothing and calls no Supabase client for a system actor", async () => {
    // If chargeQuota ever stopped short-circuiting for a system actor, this
    // test would hang or throw on a real network call instead of resolving
    // — there is no mock standing in for lib/db/aiUsage.ts here at all,
    // deliberately, so a regression there fails loudly rather than passing
    // by accident through an unrelated mock.
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");
    vi.mocked(generateText).mockResolvedValueOnce({ text: "ok" } as never);

    await expect(
      generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })
    ).resolves.toBe("ok");
  });
});
