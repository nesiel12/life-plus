import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Regression coverage for the exact 2026-09-25 "משהו השתבש ביצירת השיעור"
// incident: a provider rejecting the request outright (Groq refusing a
// JSON schema with an unsupported "format" annotation, in the real
// incident) correctly fired streamObject's onError — but the code then
// still `await`ed result.object, which never resolved OR rejected, not
// even past its own abortSignal timeout. The masterclass lesson route hung
// until the platform's own ceiling killed it, with no honest error ever
// reaching the user or the server log.
//
// The mock below reproduces the real SDK's actual observed behavior,
// verified live with a diagnostic script against the real Groq API: the
// partialObjectStream ends immediately with zero chunks and no thrown
// error, and result.object is a promise this test never resolves —
// exactly the hang. If streamStructuredData regresses back to blindly
// awaiting that promise, this test itself hangs (Vitest's own test
// timeout catches it, loudly, rather than the assertion silently passing).

const streamObjectMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamObject: streamObjectMock };
});

let chain: { kind: "sdk"; label: string; model: string }[] = [];
vi.mock("@/lib/ai/provider", () => ({
  getChatModelChain: () => chain,
}));

const { streamStructuredData } = await import("@/lib/ai/service");

const SYSTEM_ACTOR = { kind: "system" as const, job: "structured-hang-test" };
const SCHEMA = z.object({ jokeText: z.string() });

function candidate(label: string) {
  return { kind: "sdk" as const, label, model: label };
}

beforeEach(() => {
  streamObjectMock.mockReset();
  chain = [];
});

afterEach(() => {
  chain = [];
});

describe("streamStructuredData: the exact 2026-09-25 hang", () => {
  it("throws the captured onError immediately instead of hanging on a never-settling result.object", async () => {
    chain = [candidate("groq:test")];
    streamObjectMock.mockImplementationOnce(({ onError }: { onError: (e: { error: unknown }) => void }) => {
      const error = Object.assign(new Error("invalid JSON schema for response_format: unknown or unsupported string format 'uri'"), { statusCode: 400 });
      onError({ error });
      return {
        partialObjectStream: (async function* () {})(), // ends immediately, zero chunks — the real, observed behavior
        object: new Promise(() => {}), // never resolves or rejects — the real, observed hang
      };
    });

    await expect(streamStructuredData({ actor: SYSTEM_ACTOR, schema: SCHEMA, system: "s", prompt: "p", onPartial: () => {} })).rejects.toThrow(
      "unsupported string format"
    );
  });

  it("falls over to the next candidate on the same hang-shaped failure, same as any other retryable error", async () => {
    chain = [candidate("groq:test"), candidate("gemini:test")];
    streamObjectMock
      .mockImplementationOnce(({ onError }: { onError: (e: { error: unknown }) => void }) => {
        onError({ error: Object.assign(new Error("high demand"), { statusCode: 503 }) });
        return { partialObjectStream: (async function* () {})(), object: new Promise(() => {}) };
      })
      .mockImplementationOnce(() => ({
        partialObjectStream: (async function* () {
          yield { jokeText: "בדיחה" };
        })(),
        object: Promise.resolve({ jokeText: "בדיחה" }),
      }));

    await expect(streamStructuredData({ actor: SYSTEM_ACTOR, schema: SCHEMA, system: "s", prompt: "p", onPartial: () => {} })).resolves.toEqual({
      jokeText: "בדיחה",
    });
  });

  it("still resolves normally through result.object when no error was ever captured", async () => {
    chain = [candidate("groq:test")];
    streamObjectMock.mockImplementationOnce(() => ({
      partialObjectStream: (async function* () {
        yield { jokeText: "בדיחה" };
      })(),
      object: Promise.resolve({ jokeText: "בדיחה" }),
    }));

    await expect(streamStructuredData({ actor: SYSTEM_ACTOR, schema: SCHEMA, system: "s", prompt: "p", onPartial: () => {} })).resolves.toEqual({
      jokeText: "בדיחה",
    });
  });
});
