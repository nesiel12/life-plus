"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useUndoToast } from "@/hooks/useUndoToast";
import { isSosMessage } from "@/lib/ai/fabIntents";
import { requestCompanionSos } from "@/lib/companion/sosEvent";
import { playCue, primeAudio } from "@/lib/sound/cues";
import { speechRecognitionSupported, startVoiceRecognition, type VoiceRecognizer } from "@/lib/voice/speechRecognition";
import { executeVoiceAction, type ExecutedVoiceAction, type VoiceCompanionActions } from "@/lib/voice/voiceExecutor";
import type { VoiceRoutedAction, VoiceUnresolvedItem } from "@/lib/voice/multiIntentParser";

export type VoiceCompanionPhase = "idle" | "listening" | "processing" | "reviewing" | "committing" | "error";

// The 5-second window the spec calls for on the batch undo — shorter than
// the FAB's own 8s (hooks/useUndoToast.ts's default): this toast follows an
// explicit "בצע הכל" click, not a single auto-committed log, so the person
// has already reviewed the breakdown once before anything was written.
const VOICE_UNDO_MS = 5000;

const FRIENDLY_ERROR = "לא הצלחתי להבין. נסה שוב.";
const UNAVAILABLE_ERROR = "לא הצלחתי להתחבר כרגע. נסה שוב עוד רגע.";

interface VoiceParseResponse {
  mode: "sos" | "unavailable" | "parsed";
  actions?: (VoiceRoutedAction & { summary: string })[];
  unresolved?: VoiceUnresolvedItem[];
}

/** VoiceRoutedAction is a discriminated union, not extendable via `interface X extends`. */
export type VoiceCompanionAction = VoiceRoutedAction & {
  /** Stable per-session key — the array index alone breaks once an item is removed mid-list. */
  key: string;
  summary: string;
};

/**
 * onSos: called right before handing off to the AI Companion's SOS panel —
 * the caller (VoiceCompanionModal) closes itself here. Without this, the
 * Companion's own modal stayed open on top of the SOS panel: both are
 * centered, backdropped Modal instances, so this one's dimmed backdrop
 * completely hid the breathing exercise underneath it — exactly the wrong
 * failure mode for a distress handoff. Found live, not by inspection.
 */
export function useVoiceCompanion(onSos?: () => void) {
  const [phase, setPhase] = useState<VoiceCompanionPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [actions, setActions] = useState<VoiceCompanionAction[]>([]);
  const [unresolved, setUnresolved] = useState<VoiceUnresolvedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const recognizerRef = useRef<VoiceRecognizer | null>(null);
  const nextKey = useRef(0);
  const undoToast = useUndoToast(VOICE_UNDO_MS);

  const people = useAtlasStore((s) => s.people);
  const addTask = useAtlasStore((s) => s.addTask);
  const deleteTask = useAtlasStore((s) => s.deleteTask);
  const addTransaction = useAtlasStore((s) => s.addTransaction);
  const deleteTransaction = useAtlasStore((s) => s.deleteTransaction);
  const updateLearningResource = useAtlasStore((s) => s.updateLearningResource);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const updatePerson = useAtlasStore((s) => s.updatePerson);
  const addMoment = useAtlasStore((s) => s.addMoment);
  const deleteMoment = useAtlasStore((s) => s.deleteMoment);

  const storeActions = useMemo<VoiceCompanionActions>(
    () => ({
      addTask: (input) => addTask(input),
      deleteTask,
      addTransaction: (input) => addTransaction(input),
      deleteTransaction,
      updateLearningResource,
      findPerson: (personId) => people.find((p) => p.id === personId),
      logPersonInteraction,
      updatePerson,
      addMoment: (input) => addMoment(input),
      deleteMoment,
    }),
    [addTask, deleteTask, addTransaction, deleteTransaction, updateLearningResource, people, logPersonInteraction, updatePerson, addMoment, deleteMoment]
  );

  const micSupported = useMemo(() => speechRecognitionSupported(), []);

  const reset = useCallback(() => {
    setPhase("idle");
    setTranscript("");
    setActions([]);
    setUnresolved([]);
    setError(null);
  }, []);

  const parse = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setPhase("idle");
      return;
    }

    // Same rule as every other free-text surface in the app (see
    // lib/ai/fabIntents.ts's isSosMessage doc comment): checked on-device,
    // before a single byte leaves it. A match hands off to the existing
    // Companion's SOS panel rather than building a second one here.
    if (isSosMessage(trimmed)) {
      reset();
      onSos?.();
      requestCompanionSos();
      return;
    }

    setPhase("processing");
    setError(null);
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) throw new Error("request failed");
      const data: VoiceParseResponse = await res.json();

      if (data.mode === "sos") {
        reset();
        onSos?.();
        requestCompanionSos();
        return;
      }
      if (data.mode === "unavailable") {
        setError(UNAVAILABLE_ERROR);
        setPhase("error");
        return;
      }

      const routed = (data.actions ?? []).map((a) => ({ ...a, key: `voice-${nextKey.current++}` }));
      setActions(routed);
      setUnresolved(data.unresolved ?? []);
      setPhase("reviewing");
    } catch {
      setError(FRIENDLY_ERROR);
      setPhase("error");
    }
  }, [reset, onSos]);

  const startListening = useCallback(() => {
    primeAudio();
    playCue("pop");
    setTranscript("");
    setError(null);
    setPhase("listening");

    const recognizer = startVoiceRecognition(
      (update) => setTranscript(update.transcript),
      () => {
        recognizerRef.current = null;
        // onEnd fires for a normal stop() too — the transcript accumulated up
        // to that point is what gets parsed, whatever silence or stop caused it.
        setTranscript((current) => {
          if (current.trim()) void parse(current);
          else setPhase("idle");
          return current;
        });
      }
    );

    if (!recognizer) {
      setPhase("idle");
      setError("זיהוי הדיבור לא זמין בדפדפן הזה — אפשר להקליד במקום.");
      return;
    }
    recognizerRef.current = recognizer;
    playCue("tick");
  }, [parse]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    playCue("tick", 4);
  }, []);

  const submitText = useCallback(
    (text: string) => {
      void parse(text);
    },
    [parse]
  );

  const removeAction = useCallback((key: string) => {
    setActions((current) => current.filter((a) => a.key !== key));
  }, []);

  const executeAll = useCallback(async () => {
    if (actions.length === 0) return;
    setPhase("committing");
    setError(null);

    const results: ExecutedVoiceAction[] = [];
    let failedCount = 0;

    for (const item of actions) {
      try {
        const executed = await executeVoiceAction(item, storeActions);
        if (executed) results.push(executed);
      } catch {
        failedCount += 1;
      }
    }

    if (results.length === 0) {
      setError(failedCount > 0 ? "הרישום לא נשמר. נסה שוב." : FRIENDLY_ERROR);
      setPhase("reviewing");
      return;
    }

    const summary = results.length === 1 ? results[0].summary : `${results.length} פעולות נרשמו בהצלחה`;
    undoToast.show(summary, async () => {
      await Promise.all(results.map((r) => r.undo()));
    });

    playCue("chime");
    void confetti({ particleCount: 60, spread: 75, startVelocity: 32, origin: { x: 0.5, y: 0.7 }, disableForReducedMotion: true, zIndex: 160 });

    if (failedCount > 0) {
      setError(`${failedCount} פעולות לא נרשמו — אפשר לנסות שוב.`);
      setActions((current) => current.filter((a) => !results.some((r) => r.action === a)));
      setPhase("reviewing");
    } else {
      reset();
    }
  }, [actions, storeActions, undoToast, reset]);

  return {
    phase,
    transcript,
    actions,
    unresolved,
    error,
    micSupported,
    undoToast,
    startListening,
    stopListening,
    submitText,
    removeAction,
    executeAll,
    reset,
  };
}
