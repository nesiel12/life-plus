import "server-only";
import { after } from "next/server";

// Server-Sent Events for the long learning generations (the masterclass
// block, the step brief). Three things a plain JSON response can't do:
//
// 1. Bytes move from the first second — a heartbeat comment every 10s and a
//    `partial` event as the model writes — so no proxy or platform idle
//    timeout cuts a request that is merely slow, and the UI can show real
//    progress instead of a spinner that looks hung.
// 2. The generation outlives the connection. If the person navigates to
//    another step mid-stream, the work already paid for (quota was charged
//    up front) still finishes and lands in the cache — the next visit to
//    that step is instant. `after()` keeps the function alive for it.
// 3. `partial` events are throttled: each one is a whole snapshot of the
//    object so far, so sending every token's snapshot would be quadratic.

export type SseSend = (event: string, data: unknown) => void;

const HEARTBEAT_MS = 10_000;
const PARTIAL_THROTTLE_MS = 250;

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disables response buffering on nginx-style proxies.
  "X-Accel-Buffering": "no",
  // Opts out of Next's response compression, whose gzip stream held back the
  // small heartbeat frames (seen live: pings arrived with Accept-Encoding:
  // identity, never under gzip).
  "Content-Encoding": "none",
} as const;

export function formatSseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Streams `run`'s events. `run` must send its own terminal event (`done` or
 * `error`); anything it throws becomes an `error` event with `fallbackError`.
 */
export function sseResponse(run: (send: SseSend, sendPartial: (data: unknown) => void) => Promise<void>, fallbackError: string): Response {
  const encoder = new TextEncoder();
  let closed = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  const write = (chunk: string) => {
    if (closed || !controllerRef) return;
    try {
      controllerRef.enqueue(encoder.encode(chunk));
    } catch {
      closed = true; // the client went away; keep generating for the cache
    }
  };
  const send: SseSend = (event, data) => write(formatSseEvent(event, data));

  let lastPartialAt = 0;
  let pendingPartial: unknown = undefined;
  let partialTimer: ReturnType<typeof setTimeout> | null = null;
  const flushPartial = () => {
    partialTimer = null;
    if (pendingPartial === undefined) return;
    lastPartialAt = Date.now();
    send("partial", pendingPartial);
    pendingPartial = undefined;
  };
  const sendPartial = (data: unknown) => {
    pendingPartial = data;
    if (partialTimer) return;
    const wait = Math.max(0, PARTIAL_THROTTLE_MS - (Date.now() - lastPartialAt));
    partialTimer = setTimeout(flushPartial, wait);
  };
  const sendFinal: SseSend = (event, data) => {
    if (partialTimer) clearTimeout(partialTimer);
    partialTimer = null;
    pendingPartial = undefined;
    send(event, data);
  };

  let finish!: () => void;
  const work = new Promise<void>((resolve) => {
    finish = resolve;
  });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      write(": open\n\n");
      const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      run(sendFinal, sendPartial)
        .catch((err) => {
          console.error("[sse] stream handler failed:", err);
          sendFinal("error", { error: fallbackError });
        })
        .finally(() => {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            try {
              controller.close();
            } catch {
              // already closed by a cancel
            }
          }
          finish();
        });
    },
    cancel() {
      closed = true;
    },
  });

  // Keep the serverless function alive until the generation has finished and
  // been cached, even if the client disconnected half-way.
  after(() => work);

  return new Response(stream, { headers: SSE_HEADERS });
}
