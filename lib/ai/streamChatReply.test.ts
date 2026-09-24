import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression coverage for the 2026-09-25 incident: streamText's own error
// handling does not throw into `for await (const chunk of result.textStream)`
// — a provider failure makes the stream end with zero chunks and no
// exception, which meant streamChatReply used to "succeed" with an empty
// body, and the chat route's error handling and logging never fired. See
// streamChatReply's own doc comment in lib/ai/service.ts for the full story.
//
// streamText is mocked directly (not left real, unlike service.fallback.
// test.ts's generateText/generateObject-only mock) because this is
// specifically about textStream's async-iteration contract, which a plain
// resolved/rejected promise mock can't express — the mock below reproduces
// the real SDK's actual behavior: onError fires, then the stream simply
// ends with no thrown error.

const streamTextMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, streamText: streamTextMock };
});

interface Candidate {
  kind: "sdk";
  label: string;
  model: string;
}

let chain: (Candidate | { kind: "bytez"; label: string; modelId: string })[] = [];
vi.mock("@/lib/ai/provider", () => ({
  getChatModelChain: () => chain,
}));

const { streamChatReply } = await import("@/lib/ai/service");

const SYSTEM_ACTOR = { kind: "system" as const, job: "stream-fallback-test" };

function candidate(label: string): Candidate {
  return { kind: "sdk", label, model: label };
}

/** Simulates a candidate that fails before producing any output — the real, live symptom. */
function failing(status: number, message = "high demand") {
  return (options: { onError?: (e: { error: unknown }) => void }) => {
    const error = Object.assign(new Error(message), { status });
    options.onError?.({ error });
    return { textStream: (async function* () {})() };
  };
}

/** Simulates a candidate that streams real text, chunk by chunk. */
function succeeding(...chunks: string[]) {
  return () => ({
    textStream: (async function* () {
      for (const c of chunks) yield c;
    })(),
  });
}

async function readAll(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

beforeEach(() => {
  streamTextMock.mockReset();
});

afterEach(() => {
  chain = [];
});

describe("streamChatReply: empty-output failover", () => {
  it("returns the primary model's stream directly when it succeeds (no failover)", async () => {
    chain = [candidate("gemini-a"), candidate("gemini-b")];
    streamTextMock.mockImplementationOnce(succeeding("שלום", " עולם"));

    const result = await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });
    const text = await readAll(result.toTextStreamResponse());

    expect(text).toBe("שלום עולם");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("falls over to the next model when the primary produces zero chunks on a retryable error (the live 503 case)", async () => {
    chain = [candidate("gemini-primary"), candidate("gemini-fallback")];
    streamTextMock.mockImplementationOnce(failing(503, "high demand")).mockImplementationOnce(succeeding("תשובה תקינה"));

    const result = await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });
    const text = await readAll(result.toTextStreamResponse());

    expect(text).toBe("תשובה תקינה");
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it("does not advance past a non-retryable failure (a dead key) and throws instead", async () => {
    chain = [candidate("gemini-primary"), candidate("gemini-fallback")];
    streamTextMock.mockImplementationOnce(failing(401, "Invalid API key"));

    await expect(streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR })).rejects.toThrow("Invalid API key");
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it("throws the real provider error (not a silent empty 200) when every candidate fails", async () => {
    chain = [candidate("gemini-primary"), candidate("gemini-fallback")];
    streamTextMock.mockImplementationOnce(failing(503, "high demand: primary")).mockImplementationOnce(failing(503, "high demand: fallback"));

    await expect(streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR })).rejects.toThrow("high demand: fallback");
    expect(streamTextMock).toHaveBeenCalledTimes(2);
  });

  it("never re-sends the first chunk already read while probing for output", async () => {
    chain = [candidate("gemini-a")];
    streamTextMock.mockImplementationOnce(succeeding("א", "ב", "ג"));

    const result = await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });
    const text = await readAll(result.toTextStreamResponse());

    expect(text).toBe("אבג");
  });

  it("disables the SDK's own retry (this function's fallover already covers it) and disables thinking for a non-lite Gemini candidate", async () => {
    chain = [candidate("gemini:gemini-3.6-flash")];
    streamTextMock.mockImplementationOnce(succeeding("hi"));

    await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });

    const call = streamTextMock.mock.calls[0][0];
    expect(call.maxRetries).toBe(0);
    expect(call.providerOptions).toEqual({ google: { thinkingConfig: { thinkingBudget: 0 } } });
  });

  it("never sends thinkingConfig to a lite Gemini candidate (400s live if it does)", async () => {
    chain = [candidate("gemini:gemini-flash-lite-latest")];
    streamTextMock.mockImplementationOnce(succeeding("hi"));

    await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });

    expect(streamTextMock.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it("never sends thinkingConfig to a non-Gemini candidate", async () => {
    chain = [candidate("openai:gpt-4o-mini")];
    streamTextMock.mockImplementationOnce(succeeding("hi"));

    await streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR });

    expect(streamTextMock.mock.calls[0][0].providerOptions).toBeUndefined();
  });

  it("throws when no configured model supports streaming (empty chain)", async () => {
    chain = [];
    await expect(streamChatReply({ system: "s", messages: [], actor: SYSTEM_ACTOR })).rejects.toThrow(
      "no configured model supports streaming"
    );
    expect(streamTextMock).not.toHaveBeenCalled();
  });
});
