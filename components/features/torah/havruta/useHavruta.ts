"use client";

import { useCallback, useRef, useState } from "react";
import type { HavrutaMode, HavrutaSubjectType } from "@/lib/torah/havruta";
import type { HavrutaMessageView, HavrutaThreadView } from "@/lib/torah/havrutaDto";

export interface HavrutaSubjectInfo {
  title: string;
  byline: string | null;
  contradiction: {
    left: { label: string; excerpt: string };
    right: { label: string; excerpt: string };
    explanation: string;
  } | null;
}

export interface HavrutaSession {
  thread: HavrutaThreadView;
  messages: HavrutaMessageView[];
  subject: HavrutaSubjectInfo;
  openers: string[];
  subjectHref?: string | null;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function errorText(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === "string" ? data.error : fallback;
}

/**
 * Client state for one Havruta conversation.
 *
 * The learner's message is shown immediately (optimistic) and then replaced
 * by the saved row the server returns; on failure it stays, with the error,
 * because the server saved it before calling the model.
 */
export function useHavruta() {
  const [session, setSession] = useState<HavrutaSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const open = useCallback(
    async (subjectType: HavrutaSubjectType, subjectId: string, mode: HavrutaMode = "debate", fresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/torah/havruta", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectType, subjectId, mode, fresh }),
        });
        const data = await readJson(response);
        if (!response.ok || !data.thread) {
          setError(errorText(data, "לא הצלחנו לפתוח את החברותא."));
          return null;
        }
        const next = data as unknown as HavrutaSession;
        setSession(next);
        return next;
      } catch {
        setError("לא הצלחנו לפתוח את החברותא.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const load = useCallback(async (threadId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/torah/havruta/${threadId}`, { cache: "no-store" });
      const data = await readJson(response);
      if (!response.ok || !data.thread) {
        setError(errorText(data, "הדיון לא נמצא."));
        return null;
      }
      const next = data as unknown as HavrutaSession;
      setSession(next);
      return next;
    } catch {
      setError("טעינת הדיון נכשלה.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!session || message.length < 2 || busy.current) return false;
      busy.current = true;
      setPending(message);
      setError(null);
      try {
        const response = await fetch(`/api/torah/havruta/${session.thread.id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        });
        const data = await readJson(response);
        const saved = [data.userMessage, data.assistantMessage].filter(Boolean) as HavrutaMessageView[];
        if (saved.length) {
          setSession((prev) => (prev ? { ...prev, messages: [...prev.messages, ...saved] } : prev));
        }
        if (!response.ok || data.error || !data.assistantMessage) {
          setError(errorText(data, "החברותא לא הצליחה לענות. נסה שוב."));
          // Nothing was saved (validation, rate limit): hand the text back.
          return saved.length > 0;
        }
        return true;
      } catch {
        setError("החברותא לא הצליחה לענות. נסה שוב.");
        return false;
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [session]
  );

  const summarize = useCallback(async () => {
    if (!session) return;
    setSummarizing(true);
    setError(null);
    try {
      const response = await fetch(`/api/torah/havruta/${session.thread.id}/insights`, { method: "POST" });
      const data = await readJson(response);
      if (!response.ok || !data.thread) {
        setError(errorText(data, "הסיכום נכשל. נסה שוב."));
        return;
      }
      setSession((prev) => (prev ? { ...prev, thread: data.thread as HavrutaThreadView } : prev));
    } catch {
      setError("הסיכום נכשל. נסה שוב.");
    } finally {
      setSummarizing(false);
    }
  }, [session]);

  return { session, loading, pending, summarizing, error, open, load, send, summarize, setError };
}
