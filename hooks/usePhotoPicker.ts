"use client";

import { useCallback, useRef, useState } from "react";

// Drives the Google Photos picking flow from the client.
//
// Two constraints shape this and neither is optional:
//  - The pickerUri CANNOT be iframed (Google blocks it), so it must open in a
//    new tab or window.
//  - There is no webhook or callback. Polling is the only completion signal
//    Google offers, and pollingConfig is re-issued on every poll then vanishes
//    once picking completes — so the interval is read per-response, never
//    cached from session creation.

const DEFAULT_POLL_MS = 4000;
const MAX_POLL_MS = 15 * 60 * 1000;

type PickerState = "idle" | "opening" | "waiting" | "importing" | "done" | "error";

interface UsePhotoPickerResult {
  state: PickerState;
  error: string | null;
  /** Set when Google Photos has not been connected yet. */
  needsConnect: boolean;
  result: { imported: number; skipped: number } | null;
  start: (purpose: "memories" | "avatar", personId?: string) => Promise<void>;
  reset: () => void;
}

function parseSeconds(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) return fallback;
  const ms = Number(match[1]) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : fallback;
}

export function usePhotoPicker(onComplete?: () => void): UsePhotoPickerResult {
  const [state, setState] = useState<PickerState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const cancelled = useRef(false);

  const reset = useCallback(() => {
    cancelled.current = true;
    setState("idle");
    setError(null);
    setNeedsConnect(false);
    setResult(null);
  }, []);

  const start = useCallback(
    async (purpose: "memories" | "avatar", personId?: string) => {
      cancelled.current = false;
      setState("opening");
      setError(null);
      setNeedsConnect(false);
      setResult(null);

      try {
        const res = await fetch("/api/photos/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose, personId }),
        });
        const data = await res.json();

        if (res.status === 409 && data.code === "not_connected") {
          setNeedsConnect(true);
          setState("error");
          return;
        }
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "לא הצלחנו לפתוח את בורר התמונות.");
          setState("error");
          return;
        }

        // Must be a new tab — Google refuses to render the picker in an iframe.
        window.open(data.pickerUri, "_blank", "noopener,noreferrer");
        setState("waiting");

        const startedAt = Date.now();
        let intervalMs = parseSeconds(data.pollingConfig?.pollInterval, DEFAULT_POLL_MS);

        while (!cancelled.current) {
          if (Date.now() - startedAt > MAX_POLL_MS) {
            setError("תם הזמן להמתנה לבחירת התמונות.");
            setState("error");
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, intervalMs));
          if (cancelled.current) return;

          const pollRes = await fetch(`/api/photos/session/${encodeURIComponent(data.sessionId)}`);
          if (!pollRes.ok) {
            setError("בדיקת הבחירה נכשלה.");
            setState("error");
            return;
          }
          const poll = await pollRes.json();

          if (poll.mediaItemsSet) break;
          // Re-read every time: Google re-issues this per poll.
          intervalMs = parseSeconds(poll.pollingConfig?.pollInterval, intervalMs);
        }

        if (cancelled.current) return;
        setState("importing");

        const ingestRes = await fetch("/api/photos/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: data.sessionId }),
        });
        const ingest = await ingestRes.json();

        if (!ingestRes.ok) {
          setError(typeof ingest.error === "string" ? ingest.error : "הייבוא נכשל.");
          setState("error");
          return;
        }

        setResult({ imported: ingest.imported ?? 0, skipped: ingest.skipped ?? 0 });
        setState("done");
        onComplete?.();
      } catch {
        setError("לא הצלחנו להגיע לשירות התמונות.");
        setState("error");
      }
    },
    [onComplete]
  );

  return { state, error, needsConnect, result, start, reset };
}
