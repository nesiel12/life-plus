// The browser half of lib/api/sse.ts: reads a text/event-stream response
// from a POST (EventSource only does GET, and these requests carry a body).
// The parser is pure so the framing rules — events split across network
// chunks, comment lines, multi-line data — are unit-tested without a server.

export interface SseEvent {
  event: string;
  data: string;
}

/**
 * Splits `buffer` into complete events plus the unfinished tail to carry
 * into the next chunk. Comment lines (": ping") are dropped; an event with
 * no `event:` field is a "message", per the SSE spec.
 */
export function parseSseBuffer(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events: SseEvent[] = [];
  for (const block of blocks) {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
    }
    if (data.length > 0) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

/** Reads the whole stream, calling `onEvent` with each event's JSON-parsed data. */
export async function readSseStream(response: Response, onEvent: (event: string, data: unknown) => void): Promise<void> {
  if (!response.body) throw new Error("empty stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseSseBuffer(buffer);
    buffer = rest;
    for (const e of events) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(e.data);
      } catch {
        continue; // a malformed frame is skipped, not fatal
      }
      onEvent(e.event, parsed);
    }
  }
}
