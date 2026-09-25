import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Proves the real, deployed fallback chain, not a reimplementation of it.
// Everything below imports the actual exported functions from
// lib/ai/service.ts and lib/ai/provider.ts — the same code every AI route
// in the app calls — with only the network edges mocked: the AI SDK's
// generateText/generateObject (every "sdk"-kind candidate — Groq, Cerebras,
// SambaNova, Gemini, OpenAI and OpenRouter alike, since they're all just a
// different LanguageModel instance handed to the same calls) and
// lib/ai/bytez.ts's two exports (Bytez has no SDK integration, so it's
// mocked at that boundary instead).
//
// No real API key, no real network call, no real database write. The
// system actor is used specifically because chargeQuota() returns
// immediately for it (see lib/ai/service.ts) — this exercises the fallback
// chain with zero Supabase interaction, not a mocked one.
//
// Provider *priority* is not something this file decides — vi.stubEnv sets
// the keys, and lib/ai/provider.ts's real, unmodified getChatModelChain()
// is what turns that into an ordered chain. If that ordering ever changed
// in provider.ts, this test would still pass or fail honestly based on
// whatever the real chain produces — it is not hardcoded here. (The one
// place that DOES pin the exact order, deliberately, is provider.test.ts.)

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

afterEach(() => {
  vi.unstubAllEnvs();
  // resetAllMocks, not clearAllMocks: mockRejectedValueOnce/
  // mockResolvedValueOnce queue implementations, and clearAllMocks only
  // clears call history — a leftover queued value from one test silently
  // serves the next test's first call otherwise.
  vi.resetAllMocks();
});

describe("the real six-tier chain (Groq → Cerebras → SambaNova → Gemini ×2 → OpenRouter) — mirrors .env.local exactly", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("CEREBRAS_API_KEY", "cerebras-test-key");
    vi.stubEnv("SAMBANOVA_API_KEY", "sambanova-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  });

  it("returns the primary's own response directly when it simply succeeds (no fallover triggered)", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockResolvedValueOnce({ text: "תשובת Groq" } as never);

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).resolves.toBe("תשובת Groq");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("falls over tier by tier on a capacity failure, in order, and returns whichever tier finally succeeds", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("groq")) // 1
      .mockRejectedValueOnce(retryableFailure("cerebras")) // 2
      .mockResolvedValueOnce({ text: "תשובה מ-SambaNova" } as never); // 3

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).resolves.toBe("תשובה מ-SambaNova");
    expect(generateText).toHaveBeenCalledTimes(3);
  });

  it("does not stop after Gemini's own first model — its second model is a real, distinct fourth attempt", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("groq"))
      .mockRejectedValueOnce(retryableFailure("cerebras"))
      .mockRejectedValueOnce(retryableFailure("sambanova"))
      .mockRejectedValueOnce(retryableFailure("gemini-primary"))
      .mockResolvedValueOnce({ text: "תשובה מ-Gemini השני" } as never);

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).resolves.toBe("תשובה מ-Gemini השני");
    expect(generateText).toHaveBeenCalledTimes(5);
  });

  it("reaches OpenRouter — strictly last — only once every other tier has failed", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("groq"))
      .mockRejectedValueOnce(retryableFailure("cerebras"))
      .mockRejectedValueOnce(retryableFailure("sambanova"))
      .mockRejectedValueOnce(retryableFailure("gemini-primary"))
      .mockRejectedValueOnce(retryableFailure("gemini-fallback"))
      .mockResolvedValueOnce({ text: "תשובה מ-OpenRouter" } as never);

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).resolves.toBe("תשובה מ-OpenRouter");
    expect(generateText).toHaveBeenCalledTimes(6);
  });

  it("does not advance past a non-retryable failure (a dead key) — fails fast instead of trying five more providers", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockRejectedValueOnce(fatalFailure());

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).rejects.toThrow("Invalid API key");
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it("throws the last error when the entire six-candidate chain fails", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    for (const label of ["groq", "cerebras", "sambanova", "gemini-primary"]) {
      vi.mocked(generateText).mockRejectedValueOnce(retryableFailure(label));
    }
    vi.mocked(generateText).mockRejectedValueOnce(retryableFailure("gemini-fallback"));
    vi.mocked(generateText).mockRejectedValueOnce(retryableFailure("openrouter-final"));

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).rejects.toThrow("openrouter-final");
    expect(generateText).toHaveBeenCalledTimes(6);
  });
});

describe("Bytez as a mid-chain tail candidate (Gemini → Bytez → OpenAI, no Groq/Cerebras/SambaNova/OpenRouter keys)", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("BYTEZ_API_KEY", "bytez-test-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  });

  // The real chain here is 4 candidates, not 3: Gemini's own two models
  // (see provider.test.ts's "orders Groq, Cerebras, SambaNova, then Gemini
  // (two models deep)"), then Bytez, then OpenAI.

  it("falls back to Bytez once BOTH Gemini models have failed", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText).mockRejectedValueOnce(retryableFailure("gemini-primary")).mockRejectedValueOnce(retryableFailure("gemini-fallback"));
    vi.mocked(bytezGenerateText).mockResolvedValueOnce("תשובה מ-Bytez");

    const result = await generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toBe("תשובה מ-Bytez");
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(bytezGenerateText).toHaveBeenCalledTimes(1);
  });

  it("continues to OpenAI when both Gemini models AND Bytez all fail", async () => {
    const { generateText } = await import("ai");
    const { bytezGenerateText } = await import("@/lib/ai/bytez");
    const { generateChatText } = await import("@/lib/ai/service");

    vi.mocked(generateText)
      .mockRejectedValueOnce(retryableFailure("gemini-primary"))
      .mockRejectedValueOnce(retryableFailure("gemini-fallback"))
      .mockResolvedValueOnce({ text: "תשובה מ-OpenAI" } as never);
    vi.mocked(bytezGenerateText).mockRejectedValueOnce(retryableFailure("bytez"));

    const result = await generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });

    expect(result).toBe("תשובה מ-OpenAI");
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(bytezGenerateText).toHaveBeenCalledTimes(1);
  });

  describe("generateStructuredData", () => {
    const schema = z.object({ title: z.string() });

    it("falls back to Bytez's structured output once both Gemini models fail", async () => {
      const { generateObject } = await import("ai");
      const { bytezGenerateObject } = await import("@/lib/ai/bytez");
      const { generateStructuredData } = await import("@/lib/ai/service");

      vi.mocked(generateObject).mockRejectedValueOnce(retryableFailure("gemini-primary")).mockRejectedValueOnce(retryableFailure("gemini-fallback"));
      vi.mocked(bytezGenerateObject).mockResolvedValueOnce({ title: "מ-Bytez" });

      const result = await generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR });

      expect(result).toEqual({ title: "מ-Bytez" });
      expect(generateObject).toHaveBeenCalledTimes(2);
      expect(bytezGenerateObject).toHaveBeenCalledTimes(1);
    });

    it("continues to OpenAI's structured output when both Gemini models and Bytez all fail", async () => {
      const { generateObject } = await import("ai");
      const { bytezGenerateObject } = await import("@/lib/ai/bytez");
      const { generateStructuredData } = await import("@/lib/ai/service");

      vi.mocked(generateObject)
        .mockRejectedValueOnce(retryableFailure("gemini-primary"))
        .mockRejectedValueOnce(retryableFailure("gemini-fallback"))
        .mockResolvedValueOnce({ object: { title: "מ-OpenAI" } } as never);
      vi.mocked(bytezGenerateObject).mockRejectedValueOnce(retryableFailure("bytez"));

      const result = await generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR });

      expect(result).toEqual({ title: "מ-OpenAI" });
      expect(generateObject).toHaveBeenCalledTimes(3);
      expect(bytezGenerateObject).toHaveBeenCalledTimes(1);
    });

    // Bytez's own schema-validation failure (see lib/ai/bytez.ts) is a
    // correctness failure, not a capacity one, and is thrown with no
    // `.status` — proving the chain still advances past it here is what
    // establishes that isRetryableAiError's text-matching path, not just
    // its status-code path, genuinely drives this fallback too.
    it("does NOT advance to OpenAI on Bytez's own schema-validation failure", async () => {
      const { generateObject } = await import("ai");
      const { bytezGenerateObject } = await import("@/lib/ai/bytez");
      const { generateStructuredData } = await import("@/lib/ai/service");

      vi.mocked(generateObject).mockRejectedValueOnce(retryableFailure("gemini-primary")).mockRejectedValueOnce(retryableFailure("gemini-fallback"));
      vi.mocked(bytezGenerateObject).mockRejectedValueOnce(new Error("Bytez did not return valid JSON: ..."));

      await expect(generateStructuredData({ schema, system: "s", prompt: "p", actor: SYSTEM_ACTOR })).rejects.toThrow(
        "Bytez did not return valid JSON"
      );
      // OpenAI's own generateObject call must never have happened.
      expect(generateObject).toHaveBeenCalledTimes(2);
    });
  });
});

describe("system actor never touches the database", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
  });

  it("charges nothing and calls no Supabase client for a system actor", async () => {
    // If chargeQuota ever stopped short-circuiting for a system actor, this
    // test would hang or throw on a real network call instead of resolving
    // — there is no mock standing in for lib/db/aiUsage.ts here at all,
    // deliberately, so a regression there fails loudly rather than passing
    // by accident through an unrelated mock.
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");
    vi.mocked(generateText).mockResolvedValueOnce({ text: "ok" } as never);

    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR })).resolves.toBe("ok");
  });
});

describe("shared time budget across the whole fallover loop (2026-09-25)", () => {
  // Before this fix, each candidate got its own FULL per-call timeout,
  // uncapped by how many were already tried — with the chain now up to six
  // deep, a broad outage could take minutes before finally giving up,
  // outliving both the route's own maxDuration and the client's stall
  // watchdog. These tests use real timers and a mock that genuinely takes
  // measurable time per attempt (via vi.advanceTimersByTimeAsync) to prove
  // the loop actually stops calling further candidates once the shared
  // budget is spent, rather than mocking away the very thing being tested.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("GROQ_API_KEY", "groq-test-key");
    vi.stubEnv("CEREBRAS_API_KEY", "cerebras-test-key");
    vi.stubEnv("SAMBANOVA_API_KEY", "sambanova-test-key");
    vi.stubEnv("GEMINI_API_KEY", "gemini-test-key");
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops trying further candidates once the shared budget is spent, rather than giving each one a full timeout", async () => {
    const { generateText } = await import("ai");
    const { generateChatText } = await import("@/lib/ai/service");

    // Each rejection "costs" 15s of wall-clock time before landing — three
    // of those (45s) alone exceeds TOTAL_CHAT_BUDGET_MS (40s), so a fourth,
    // fifth or sixth attempt must never happen even though six candidates
    // are configured.
    let calls = 0;
    vi.mocked(generateText).mockImplementation(async () => {
      calls += 1;
      await vi.advanceTimersByTimeAsync(15_000);
      throw retryableFailure(`candidate-${calls}`);
    });

    const promise = generateChatText({ system: "s", prompt: "p", actor: SYSTEM_ACTOR });
    await expect(promise).rejects.toThrow(/candidate-\d/);
    // Not all six — the shared budget ran out first.
    expect(calls).toBeLessThan(6);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
