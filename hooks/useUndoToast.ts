"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type UndoToastStatus = "idle" | "undoing" | "undone" | "failed";

export interface UndoToastState {
  id: number;
  summary: string;
  status: UndoToastStatus;
}

// How long each state stays up. "idle" is the window in which an undo is
// possible at all, so it is generous by default; the result states only need
// to be read. A caller with its own explicit safety window (the Voice
// Companion's spec calls for exactly 5s on a batch of writes) can override
// just that one via `idleMs` rather than this module growing a second
// hook for the same "toast with an undo behind it" shape.
const DISMISS_MS = (idleMs: number): Record<Exclude<UndoToastStatus, "undoing">, number> => ({
  idle: idleMs,
  undone: 2500,
  failed: 5000,
});

/**
 * One toast at a time, with a real undo behind it.
 *
 * Showing a second toast replaces the first, so the earlier log can no longer
 * be undone from here — the same trade Gmail's "Undo send" makes, and simpler
 * than a stack nobody can keep track of. The timer pauses while the toast is
 * hovered or focused, so a keyboard or slow-moving user is not raced.
 */
export function useUndoToast(idleMs = 8000) {
  const [toast, setToast] = useState<UndoToastState | null>(null);
  const undoRef = useRef<(() => Promise<void>) | null>(null);
  const nextId = useRef(0);
  const [paused, setPaused] = useState(false);

  const show = useCallback((summary: string, undo: () => Promise<void>) => {
    undoRef.current = undo;
    setToast({ id: ++nextId.current, summary, status: "idle" });
  }, []);

  const dismiss = useCallback(() => {
    undoRef.current = null;
    setToast(null);
  }, []);

  const undo = useCallback(async () => {
    const run = undoRef.current;
    if (!run) return;
    const id = nextId.current;
    setToast((t) => (t && t.id === id ? { ...t, status: "undoing" } : t));
    try {
      await run();
      setToast((t) => (t && t.id === id ? { ...t, status: "undone" } : t));
    } catch {
      setToast((t) => (t && t.id === id ? { ...t, status: "failed" } : t));
    }
  }, []);

  const status = toast?.status;
  const toastId = toast?.id;
  useEffect(() => {
    if (status === undefined || status === "undoing" || paused) return;
    const timer = setTimeout(dismiss, DISMISS_MS(idleMs)[status]);
    return () => clearTimeout(timer);
  }, [status, toastId, paused, dismiss, idleMs]);

  return { toast, show, undo, dismiss, setPaused };
}
