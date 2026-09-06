import { beforeEach, describe, expect, it, vi } from "vitest";

// Enforcement behaviour at the service boundary: who gets charged, who is
// exempt, and what a rejected caller receives.
//
// The database function itself is covered against real Postgres in
// lib/db/aiUsage.integration.test.ts — including the concurrency guarantee,
// which is the one thing a mock genuinely cannot demonstrate. What is mocked
// here is only the round trip, so the questions below are about the calling
// logic rather than about SQL.

const consumeAiUnits = vi.fn();
const adjustAiUnits = vi.fn();

vi.mock("@/lib/db/aiUsage", () => ({
  consumeAiUnits: (...args: unknown[]) => consumeAiUnits(...args),
  adjustAiUnits: (...args: unknown[]) => adjustAiUnits(...args),
  readAiUsage: vi.fn(),
}));

// The provider is never reached in the rejection tests; it is stubbed so the
// allowed paths do not attempt a network call.
vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "ok" })),
  generateObject: vi.fn(async () => ({ object: { ok: true } })),
  streamText: vi.fn(() => ({ toTextStreamResponse: () => new Response("ok") })),
  experimental_transcribe: vi.fn(async () => ({ text: "hello", durationInSeconds: 120 })),
}));

vi.mock("@/lib/ai/provider", () => ({
  getChatModel: () => "model",
  getChatModelChain: () => [{ label: "test", model: "model" }],
  getTranscriptionModel: () => "whisper",
}));

const { AiQuotaExceededError, generateChatText, transcribeAudio } = await import("@/lib/ai/service");
const { aiQuotaResponse } = await import("@/lib/api/aiErrorResponse");

const USER = { kind: "user" as const, userId: "11111111-1111-1111-1111-111111111111" };
const SYSTEM = { kind: "system" as const, job: "daily_insight" };

const allow = () => consumeAiUnits.mockResolvedValue({ allowed: true, rejectedScope: null, used: null, cap: null });
const deny = (scope: string) =>
  consumeAiUnits.mockResolvedValue({ allowed: false, rejectedScope: scope, used: 40, cap: 40 });

beforeEach(async () => {
  consumeAiUnits.mockReset();
  adjustAiUnits.mockReset();
  // The `ai` module mocks persist across tests too. Without clearing them, an
  // assertion that the provider was never reached counts calls made by an
  // earlier test in this file and fails for the wrong reason.
  const ai = await import("ai");
  vi.mocked(ai.generateText).mockClear();
  vi.mocked(ai.generateObject).mockClear();
  vi.mocked(ai.experimental_transcribe).mockClear();
});

describe("a user under quota", () => {
  it("is allowed through and charged", async () => {
    allow();
    await expect(generateChatText({ system: "s", prompt: "p", actor: USER })).resolves.toBe("ok");
    expect(consumeAiUnits).toHaveBeenCalledTimes(1);
    expect(consumeAiUnits.mock.calls[0][0]).toBe(USER.userId);
  });

  it("is charged the heavier weight for a course module", async () => {
    allow();
    const { generateStructuredData } = await import("@/lib/ai/service");
    const { z } = await import("zod");
    await generateStructuredData({
      schema: z.object({ ok: z.boolean() }),
      system: "s",
      prompt: "p",
      actor: USER,
      operation: "course_module",
    });
    const budgets = consumeAiUnits.mock.calls[0][1] as { scope: string; cost: number }[];
    expect(budgets.find((b) => b.scope === "day")?.cost).toBe(3);
  });
});

describe("a user at their limit", () => {
  it("is rejected before the model is ever called", async () => {
    deny("day");
    const ai = await import("ai");
    await expect(generateChatText({ system: "s", prompt: "p", actor: USER })).rejects.toBeInstanceOf(
      AiQuotaExceededError
    );
    // The point of charging before generating: a refused request must cost
    // nothing at the provider.
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it("is told which budget ran out and when it returns", async () => {
    deny("day");
    const err = await generateChatText({ system: "s", prompt: "p", actor: USER }).catch((e) => e);
    expect(err).toBeInstanceOf(AiQuotaExceededError);
    expect(err.scope).toBe("day");
    expect(err.resetAt.getTime()).toBeGreaterThan(Date.now());
    expect(err.message).toContain("מכסת");
  });

  it("is throttled distinctly when it is the burst budget", async () => {
    deny("minute");
    const err = await generateChatText({ system: "s", prompt: "p", actor: USER }).catch((e) => e);
    expect(err.scope).toBe("minute");
    // "Wait a minute" must not read as "come back tomorrow".
    expect(err.message).not.toContain("מתחדשת בחצות");
  });
});

describe("the system actor", () => {
  it("bypasses the user quota entirely", async () => {
    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM })).resolves.toBe("ok");
    expect(consumeAiUnits).not.toHaveBeenCalled();
  });

  // Scheduled work must never be billed to whoever it happens to be about.
  it("is not charged even when a user quota would be exhausted", async () => {
    deny("day");
    await expect(generateChatText({ system: "s", prompt: "p", actor: SYSTEM })).resolves.toBe("ok");
    expect(consumeAiUnits).not.toHaveBeenCalled();
  });
});

describe("transcription", () => {
  it("reserves from the file size, then settles against the real duration", async () => {
    allow();
    // 3 MB estimates 3 minutes; the stub reports 120s = 2 minutes.
    await transcribeAudio(new Uint8Array(3_000_000), USER);
    const budgets = consumeAiUnits.mock.calls[0][1] as { scope: string; cost: number }[];
    expect(budgets.find((b) => b.scope === "transcribe_day")?.cost).toBe(3);
    expect(adjustAiUnits).toHaveBeenCalledWith(USER.userId, "transcribe_day", expect.any(String), -1);
  });

  it("does not settle for a system actor", async () => {
    await transcribeAudio(new Uint8Array(3_000_000), SYSTEM);
    expect(adjustAiUnits).not.toHaveBeenCalled();
  });

  it("is refused when the transcription budget is spent", async () => {
    deny("transcribe_day");
    const err = await transcribeAudio(new Uint8Array(1_000_000), USER).catch((e) => e);
    expect(err).toBeInstanceOf(AiQuotaExceededError);
    expect(err.message).toContain("תמלול");
  });
});

describe("aiQuotaResponse", () => {
  it("maps a quota error to a 429 the client can recognise", async () => {
    const err = new AiQuotaExceededError("day", "out of quota", new Date(Date.now() + 3_600_000));
    const res = aiQuotaResponse(err);
    expect(res?.status).toBe(429);
    const body = await res!.json();
    expect(body.code).toBe("quota_exceeded");
    expect(body.error).toBe("out of quota");
    expect(body.scope).toBe("day");
    expect(typeof body.resetAt).toBe("string");
  });

  it("sets Retry-After so a generic backoff still works", () => {
    const err = new AiQuotaExceededError("minute", "slow down", new Date(Date.now() + 30_000));
    expect(Number(aiQuotaResponse(err)?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  // A real fault must stay a 500; flattening everything into 429 would tell
  // the user to come back tomorrow when the provider is simply broken.
  it("declines anything that is not a quota error", () => {
    expect(aiQuotaResponse(new Error("provider exploded"))).toBeNull();
    expect(aiQuotaResponse(null)).toBeNull();
    expect(aiQuotaResponse("string")).toBeNull();
  });
});
