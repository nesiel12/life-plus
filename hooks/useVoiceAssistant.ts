"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useUndoToast } from "@/hooks/useUndoToast";
import { isSosMessage } from "@/lib/ai/fabIntents";
import { requestCompanionSos } from "@/lib/companion/sosEvent";
import { playCue, primeAudio } from "@/lib/sound/cues";
import { speechRecognitionSupported, startVoiceRecognition, type VoiceRecognizer } from "@/lib/voice/speechRecognition";
import { createSpeechQueue, extractSentences, speechSynthesisSupported, type SpeechQueue } from "@/lib/voice/textToSpeech";
import { executeVoiceAction, type ExecutedVoiceAction, type VoiceAssistantActions } from "@/lib/voice/voiceExecutor";
import { appendVoiceMessageAction, createVoiceSessionAction } from "@/app/actions/voiceHistory";
import type { VoiceRoutedAction, VoiceUnresolvedItem } from "@/lib/voice/multiIntentParser";

export type VoiceAssistantPhase = "idle" | "listening" | "thinking" | "speaking" | "committing" | "error";

// The 5-second window the spec calls for on the batch undo — shorter than
// the FAB's own 8s (hooks/useUndoToast.ts's default): this toast follows an
// explicit "בצע הכל" click, not a single auto-committed log, so the person
// has already reviewed the breakdown once before anything was written.
const VOICE_UNDO_MS = 5000;
// How many recent turns ride along as conversational context — enough for
// the reply to track the thread without ballooning every request.
const HISTORY_TURNS = 10;

// No separate "unavailable" message here: app/api/voice/chat/route.ts
// returns a friendly Hebrew sentence as the streamed reply body itself when
// no AI provider is configured, so it's just spoken and shown like any other
// reply — no special-casing needed on this side.
const FRIENDLY_ERROR = "לא הצלחתי להבין. נסה שוב.";

interface VoiceParseResponse {
  mode: "sos" | "unavailable" | "parsed";
  actions?: (VoiceRoutedAction & { summary: string })[];
  unresolved?: VoiceUnresolvedItem[];
}

/** VoiceRoutedAction is a discriminated union, not extendable via `interface X extends`. */
export type VoiceAssistantAction = VoiceRoutedAction & {
  /** Stable per-session key — the array index alone breaks once an item is removed mid-list. */
  key: string;
  summary: string;
};

export interface VoiceTurn {
  key: string;
  role: "user" | "assistant";
  /** The final, complete text — for the assistant, this fills in once the stream (and any speech) finishes. */
  content: string;
}

/**
 * onSos: called right before handing off to the AI Companion's SOS panel —
 * the caller (VoiceAssistantModal) closes itself here. Without this, the
 * Assistant's own modal stayed open on top of the SOS panel: both are
 * centered, backdropped Modal instances, so this one's dimmed backdrop
 * completely hid the breathing exercise underneath it — exactly the wrong
 * failure mode for a distress handoff. Found live, not by inspection.
 *
 * Two independent requests fire per utterance, neither blocking the other:
 * /api/voice/chat (fast, streamed, spoken back as sentences complete — see
 * lib/voice/textToSpeech.ts) and /api/voice/parse (slower structured
 * extraction, unchanged from the previous "Executive Voice Companion" —
 * see lib/voice/multiIntentParser.ts's header for why the two stay split).
 * The old version awaited the slow one before saying anything at all,
 * which is what produced the "stuck on מפרק את מה שאמרת…" complaint this
 * rewrite exists to fix.
 */
export function useVoiceAssistant(onSos?: () => void) {
  const [phase, setPhase] = useState<VoiceAssistantPhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<VoiceTurn[]>([]);
  const [actions, setActions] = useState<VoiceAssistantAction[]>([]);
  const [unresolved, setUnresolved] = useState<VoiceUnresolvedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [handsFree, setHandsFree] = useState(true);

  const recognizerRef = useRef<VoiceRecognizer | null>(null);
  const speechQueueRef = useRef<SpeechQueue | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesRef = useRef<VoiceTurn[]>([]);
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

  const storeActions = useMemo<VoiceAssistantActions>(
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
  const speechSupported = useMemo(() => speechSynthesisSupported(), []);

  const addMessage = useCallback((role: "user" | "assistant", content: string) => {
    const turn: VoiceTurn = { key: `msg-${nextKey.current++}`, role, content };
    messagesRef.current = [...messagesRef.current, turn];
    setMessages(messagesRef.current);
    return turn;
  }, []);

  const reset = useCallback(() => {
    setPhase("idle");
    setTranscript("");
    setError(null);
    // Deliberately NOT clearing messages/actions/unresolved/sessionId here:
    // reset() runs after every turn (see below) to drop transient state
    // (the live transcript, a stale error) without wiping the conversation
    // that's still on screen. endSession() is the real "start over."
  }, []);

  const endSession = useCallback(() => {
    speechQueueRef.current?.cancel();
    recognizerRef.current?.stop();
    sessionIdRef.current = null;
    messagesRef.current = [];
    setMessages([]);
    setActions([]);
    setUnresolved([]);
    reset();
  }, [reset]);

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current;
    const session = await createVoiceSessionAction();
    sessionIdRef.current = session.id;
    return session.id;
  }, []);

  /**
   * The background half. Fired alongside the chat call and awaited nowhere
   * — its result merges into `actions`/`unresolved` whenever it arrives,
   * never gating the conversational reply. Identical extraction/execution
   * pipeline the old Companion used (lib/voice/multiIntentParser.ts,
   * voiceExecutor.ts); only how it's invoked changed.
   */
  const extractActionsInBackground = useCallback(async (text: string) => {
    try {
      const res = await fetch("/api/voice/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const data: VoiceParseResponse = await res.json();
      if (data.mode !== "parsed") return;

      const routed = (data.actions ?? []).map((a) => ({ ...a, key: `action-${nextKey.current++}` }));
      if (routed.length > 0) setActions((current) => [...current, ...routed]);
      if ((data.unresolved ?? []).length > 0) setUnresolved((current) => [...current, ...(data.unresolved ?? [])]);
    } catch {
      // Background extraction is a bonus, not the conversation itself — a
      // failure here says nothing to the user and doesn't touch `error`.
    }
  }, []);

  const speak = useCallback((onDrained: () => void) => {
    speechQueueRef.current = createSpeechQueue((event) => {
      if (event.kind === "speaking-start") setPhase("speaking");
      else onDrained();
    });
    return speechQueueRef.current;
  }, []);

  /**
   * The fast half: streams the reply, speaking each sentence the moment it
   * completes rather than waiting for the whole thing.
   *
   * The SOS check lives here, not in each caller: this is the one place a
   * finalized utterance — spoken or typed — is about to start a session,
   * append a message and reach the network, so it's the one place that
   * matters gets screened, and no future caller can add a new path into a
   * network call by forgetting to check first. Same rule as every other
   * free-text surface in the app (see lib/ai/fabIntents.ts's isSosMessage
   * doc comment): checked on-device, before either request goes out.
   */
  const converse = useCallback(
    async (text: string) => {
      if (isSosMessage(text)) {
        reset();
        onSos?.();
        requestCompanionSos();
        return;
      }

      addMessage("user", text);
      setPhase("thinking");
      setError(null);

      void extractActionsInBackground(text);

      // Persistence rides alongside, never awaited before the reply below —
      // a slow or failed write must not delay or break the spoken answer.
      const sessionPromise = ensureSession().then((sessionId) => {
        void appendVoiceMessageAction(sessionId, "user", text).catch(() => undefined);
        return sessionId;
      });

      let queueDrained = false;
      let streamDone = false;
      const finishIfBothDone = () => {
        if (queueDrained && streamDone) {
          reset();
          if (handsFree && micSupported) startListeningInternal();
        }
      };
      const queue = speak(() => {
        queueDrained = true;
        finishIfBothDone();
      });

      try {
        const historyForApi = messagesRef.current
          .slice(-HISTORY_TURNS - 1, -1)
          .map((m) => ({ role: m.role, content: m.content }));

        const res = await fetch("/api/voice/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: historyForApi }),
        });
        if (!res.ok || !res.body) throw new Error("request failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          full += chunk;
          buffer += chunk;
          const { complete, remainder } = extractSentences(buffer);
          for (const sentence of complete) queue.enqueue(sentence);
          buffer = remainder;
        }
        if (buffer.trim()) queue.enqueue(buffer);

        const replyText = full.trim() || FRIENDLY_ERROR;
        addMessage("assistant", replyText);
        const sessionId = await sessionPromise;
        void appendVoiceMessageAction(sessionId, "assistant", replyText).catch(() => undefined);
      } catch {
        setError(FRIENDLY_ERROR);
        queue.enqueue(FRIENDLY_ERROR);
      } finally {
        streamDone = true;
        finishIfBothDone();
      }
    },
    // startListeningInternal is deliberately not in this array: it depends
    // on `converse` (below), and including it here would make the two
    // useCallbacks redefine each other in a loop every render. Their
    // closures still resolve correctly — see the definitions' own comments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMessage, extractActionsInBackground, ensureSession, speak, handsFree, micSupported, reset, onSos]
  );

  // Mutually referencing converse() above (in hands-free mode, once the
  // reply finishes speaking, the mic re-opens by calling this) — safe
  // because this callback's only dependency IS `converse`, so the two are
  // always recreated together, in the same render, and converse()'s closure
  // never sees a startListeningInternal from an older render.
  const startListeningInternal = useCallback(() => {
    speechQueueRef.current?.cancel();
    primeAudio();
    playCue("pop");
    setTranscript("");
    setError(null);
    setPhase("listening");

    const recognizer = startVoiceRecognition(
      (update) => setTranscript(update.transcript),
      () => {
        recognizerRef.current = null;
        setTranscript((current) => {
          if (current.trim()) void converse(current);
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
  }, [converse]);

  const startListening = useCallback(() => {
    // SOS is checked once the utterance is finalized (converse()), not
    // here — this only opens the mic.
    startListeningInternal();
  }, [startListeningInternal]);

  const stopListening = useCallback(() => {
    recognizerRef.current?.stop();
    playCue("tick", 4);
  }, []);

  const submitText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      void converse(trimmed);
    },
    [converse]
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
      setPhase("idle");
      return;
    }

    const summary = results.length === 1 ? results[0].summary : `${results.length} פעולות נרשמו בהצלחה`;
    undoToast.show(summary, async () => {
      await Promise.all(results.map((r) => r.undo()));
    });

    playCue("chime");
    void confetti({ particleCount: 60, spread: 75, startVelocity: 32, origin: { x: 0.5, y: 0.7 }, disableForReducedMotion: true, zIndex: 160 });

    setActions((current) => current.filter((a) => !results.some((r) => r.action === a)));
    if (failedCount > 0) setError(`${failedCount} פעולות לא נרשמו — אפשר לנסות שוב.`);
    setPhase("idle");
  }, [actions, storeActions, undoToast]);

  return {
    phase,
    transcript,
    messages,
    actions,
    unresolved,
    error,
    handsFree,
    setHandsFree,
    micSupported,
    speechSupported,
    undoToast,
    startListening,
    stopListening,
    submitText,
    removeAction,
    executeAll,
    reset,
    endSession,
  };
}
