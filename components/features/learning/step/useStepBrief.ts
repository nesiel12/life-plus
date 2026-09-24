"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readAiError } from "@/lib/api/aiClient";
import { readSseStream } from "@/lib/learning/sseClient";
import type { StepContentCacheResponse, StepContentDoneEvent } from "@/app/api/learning/step-content/route";
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

// Session memory in front of the server cache: switching back to a step
// already seen this session is a synchronous read — no request, no skeleton.
const memory = new Map<string, StepBriefContent>();

// One cache read per topic per session: every brief already generated for the
// topic lands in `memory` at once, so moving along the timeline to any of
// those steps never waits on a request.
const topicPrefetch = new Map<string, Promise<void>>();

export function prefetchTopicBriefs(topicId: string): Promise<void> {
  let pending = topicPrefetch.get(topicId);
  if (!pending) {
    pending = fetch(`/api/learning/step-content?topicId=${encodeURIComponent(topicId)}`)
      .then((res): Promise<StepContentCacheResponse> | StepContentCacheResponse => (res.ok ? res.json() : { briefs: {} }))
      .then(({ briefs }) => {
        for (const [stepId, content] of Object.entries(briefs)) if (!memory.has(stepId)) memory.set(stepId, content);
      })
      .catch(() => {
        topicPrefetch.delete(topicId); // let a later open try again
      });
    topicPrefetch.set(topicId, pending);
  }
  return pending;
}

/**
 * The brief for the selected step: memory → server cache → streamed
 * generation. Switching steps aborts the *read* of the previous stream only;
 * the server finishes that generation and caches it (lib/api/sse.ts).
 */
export function useStepBrief(topicId: string, stepId: string | null): { state: StepBriefState; retry: () => void } {
  const [state, setState] = useState<StepBriefState>(() => (stepId && memory.has(stepId) ? { kind: "ready", content: memory.get(stepId)!, cached: true } : { kind: "idle" }));
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    controllerRef.current?.abort();
    if (!stepId) {
      setState({ kind: "idle" });
      return;
    }
    const known = memory.get(stepId);
    if (known) {
      setState({ kind: "ready", content: known, cached: true });
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "loading" });
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
            memory.set(stepId, done.content);
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
    void prefetchTopicBriefs(topicId).then(() => {
      if (controller.signal.aborted) return;
      const prefetched = memory.get(stepId);
      if (prefetched) setState({ kind: "ready", content: prefetched, cached: true });
      else timer = setTimeout(() => void generate(), SETTLE_MS);
    });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [topicId, stepId, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { state, retry };
}

/** The brief for a step if it has already loaded this session — a synchronous read, no fetch. */
export function peekStepBrief(stepId: string | null | undefined): StepBriefContent | undefined {
  return stepId ? memory.get(stepId) : undefined;
}
