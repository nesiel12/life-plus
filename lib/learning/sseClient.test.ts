import { describe, expect, it } from "vitest";
import { parseSseBuffer } from "./sseClient";

describe("parseSseBuffer", () => {
  it("parses complete events and keeps the unfinished tail", () => {
    const { events, rest } = parseSseBuffer('event: partial\ndata: {"a":1}\n\nevent: done\ndata: {"b"');
    expect(events).toEqual([{ event: "partial", data: '{"a":1}' }]);
    expect(rest).toBe('event: done\ndata: {"b"');
  });

  it("drops heartbeat comments", () => {
    const { events } = parseSseBuffer(': open\n\n: ping\n\nevent: done\ndata: {}\n\n');
    expect(events).toEqual([{ event: "done", data: "{}" }]);
  });

  it("defaults the event name to message and joins multi-line data", () => {
    const { events } = parseSseBuffer("data: line1\ndata: line2\n\n");
    expect(events).toEqual([{ event: "message", data: "line1\nline2" }]);
  });

  it("handles CRLF framing", () => {
    const { events, rest } = parseSseBuffer("event: done\r\ndata: 1\r\n\r\n");
    expect(events).toEqual([{ event: "done", data: "1" }]);
    expect(rest).toBe("");
  });

  it("reassembles an event split across chunks", () => {
    const first = parseSseBuffer("event: done\nda");
    expect(first.events).toEqual([]);
    const second = parseSseBuffer(first.rest + "ta: 42\n\n");
    expect(second.events).toEqual([{ event: "done", data: "42" }]);
  });
});
