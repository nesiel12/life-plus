"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseEnrichmentOptions<T> {
  /** The enrich route, e.g. /api/torah/books/<id>/enrich. */
  url: string;
  /**
   * Whether the page is missing what enrichment provides. When true, the
   * route is called automatically once per page per sitting.
   */
  needed: boolean;
  /** Stable identity of the thing being enriched — the auto-run memo key. */
  key: string;
  onResult: (data: T) => void;
}

/**
 * Calls an enrich route automatically when a page lacks its content, and on
 * demand after that.
 *
 * "Immediately" is the requirement — a book with no Hebrew description gets
 * one written the moment its page opens, with no button to find — but only
 * ONCE per sitting (sessionStorage): a failing provider must not turn every
 * visit into another paid, failing call.
 */
export function useEnrichment<T extends { error?: string }>({ url, needed, key, onResult }: UseEnrichmentOptions<T>) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const run = useCallback(
    async (force = false) => {
      setRunning(true);
      setError(null);
      try {
        const response = await fetch(`${url}${force ? "?force=1" : ""}`, { method: "POST" });
        const data = (await response.json()) as T & { message?: string };
        onResultRef.current(data);
        if (data.error) setError(typeof data.error === "string" ? data.error : "ההשלמה נכשלה. נסה שוב.");
        else if (!response.ok) setError(data.message ?? "ההשלמה נכשלה. נסה שוב.");
      } catch {
        setError("ההשלמה נכשלה. נסה שוב.");
      } finally {
        setRunning(false);
      }
    },
    [url]
  );

  useEffect(() => {
    if (!needed) return;
    const memo = `torah-auto-enrich:${key}`;
    try {
      if (window.sessionStorage.getItem(memo)) return;
      window.sessionStorage.setItem(memo, "1");
    } catch {
      // Storage blocked: fall through and run once for this mount.
    }
    void run(false);
  }, [needed, key, run]);

  return { running, error, run };
}
