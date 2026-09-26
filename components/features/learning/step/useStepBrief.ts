"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useIsRestoring, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { readAiError } from "@/lib/api/aiClient";
import { readSseStream } from "@/lib/learning/sseClient";
import type { StepContentCacheResponse, StepContentDoneEvent } from "@/app/api/learning/step-content/route";
import { stepBriefQueryKey } from "@/lib/query/aiContentKeys";
import type { StepBriefContent } from "@/types/learning";

export type StepBriefState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "streaming"; partial: unknown }
  | { kind: "ready"; content: StepBriefContent; cached: boolean }
  | { kind: "error"; message: string };

const GENERIC_ERROR = "לא הצלחנו להכין את תקציר השלב. נסה שוב.";
// Browsing the timeline with the arrow keys passes through steps on the way
// to the one the person wants; only a selection that settles starts a
// generation (a cached step still shows instantly — see below).
const SETTLE_MS = 450;

// The query cache in front of the server cache: switching back to a step
// already seen — this session, or any earlier one on this device (it is
// persisted to IndexedDB) — is a synchronous read: no request, no skeleton,
// and it works offline.
const readBrief = (client: QueryClient, stepId: string) => client.getQueryData<StepBriefContent>(stepBriefQueryKey(stepId));

// One cache read per topic per session: every brief already generated for the
// topic lands in the query cache at once, so moving along the timeline to any
// of those steps never waits on a request.
export function prefetchTopicBriefs(client: QueryClient, topicId: string): Promise<void> {
  return client
    .fetchQuery({
      queryKey: ["step-brief-index", topicId],
      queryFn: async (): Promise<StepContentCacheResponse> => {
        const res = await fetch(`/api/learning/step-content?topicId=${encodeURIComponent(topicId)}`);
        if (!res.ok) throw new Error(`step brief index failed: ${res.status}`);
        return res.json();
      },
      staleTime: Infinity,
      retry: false,
    })
    .then(({ briefs }) => {
      for (const [stepId, content] of Object.entries(briefs)) {
        if (!readBrief(client, stepId)) client.setQueryData(stepBriefQueryKey(stepId), content);
      }
    })
    .catch(() => {
      // offline or failed — a later open tries again (errors are not cached as data)
    });
}

/**
 * The brief for the selected step: query cache → server cache → streamed
 * generation. Switching steps aborts the *read* of the previous stream only;
 * the server finishes that generation and caches it (lib/api/sse.ts).
 */
export function useStepBrief(topicId: string, stepId: string | null): { state: StepBriefState; retry: () => void } {
  const client = useQueryClient();
  const isRestoring = useIsRestoring();
  const [state, setState] = useState<StepBriefState>(() => {
    const known = stepId ? readBrief(client, stepId) : undefined;
    return known ? { kind: "ready", content: known, cached: true } : { kind: "idle" };
  });
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    if (!stepId) {
      setState({ kind: "idle" });
      return;
    }
    const known = readBrief(client, stepId);
    if (known) {
      setState({ kind: "ready", content: known, cached: true });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "loading" });
    // The IndexedDB restore may still hold this brief — never generate before it lands.
    if (isRestoring) return () => controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const generate = async () => {
      try {
        const res = await fetch("/api/learning/step-content", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
          body: JSON.stringify({ topicId, stepId }),
          signal: controller.signal,
        });
        if (!res.ok) {
          const info = await readAiError(res, GENERIC_ERROR);
          if (!controller.signal.aborted) setState({ kind: "error", message: info.message });
          return;
        }
        let finished = false;
        await readSseStream(res, (event, data) => {
          if (controller.signal.aborted) return;
          if (event === "partial") setState({ kind: "streaming", partial: data });
          else if (event === "done") {
            const done = data as StepContentDoneEvent;
            client.setQueryData(stepBriefQueryKey(stepId), done.content);
            finished = true;
            setState({ kind: "ready", content: done.content, cached: done.cached });
          } else if (event === "error") {
            finished = true;
            const message = (data as { error?: string }).error;
            setState({ kind: "error", message: message || GENERIC_ERROR });
          }
        });
        if (!finished && !controller.signal.aborted) setState({ kind: "error", message: GENERIC_ERROR });
      } catch {
        if (!controller.signal.aborted) setState({ kind: "error", message: GENERIC_ERROR });
      }
    };

    // The topic's cached briefs may still be arriving: a step they cover
    // renders the moment they land; only a step with no brief waits for the
    // selection to settle and then generates.
    void prefetchTopicBriefs(client, topicId).then(() => {
      if (controller.signal.aborted) return;
      const prefetched = readBrief(client, stepId);
      if (prefetched) setState({ kind: "ready", content: prefetched, cached: true });
      else timer = setTimeout(() => void generate(), SETTLE_MS);
    });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [client, isRestoring, topicId, stepId, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}

/** The brief for a step if it is already in the query cache — a synchronous read, no fetch. */
export function peekStepBrief(client: QueryClient, stepId: string | null | undefined): StepBriefContent | undefined {
  return stepId ? readBrief(client, stepId) : undefined;
}
