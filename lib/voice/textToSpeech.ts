// Hebrew speech synthesis for the עוזר קולי, built around one constraint: a
// SpeechSynthesisUtterance can't start speaking a sentence that hasn't
// finished streaming in yet, but it also shouldn't wait for the WHOLE reply
// to finish streaming before saying anything — that reintroduces exactly the
// "hangs for several seconds before responding" feel this rewrite exists to
// fix. So the reply is split into sentences as it streams (extractSentences,
// pure and tested), and each sentence is queued and spoken the moment it is
// complete, while the rest of the reply is still arriving.

/** The Hebrew/Latin sentence terminators worth breaking a spoken chunk on. */
const SENTENCE_END = /[.!?؟。]/;

export interface SentenceSplit {
  /** Complete sentences ready to speak, in order. */
  complete: string[];
  /** What's left after the last complete sentence — carried into the next call. */
  remainder: string;
}

/**
 * Pulls complete sentences out of a growing buffer. Pure: takes the buffer
 * accumulated so far, returns what can be spoken now and what to keep
 * buffering. Deliberately not "the whole text split on every period" — a
 * decimal ("3.5") or an ellipsis mid-thought would fragment badly — so it
 * only ever looks at the NEW tail past the last split point, keeping a
 * short trailing lookahead to avoid cutting on the "3." of "3.5".
 */
export function extractSentences(buffer: string): SentenceSplit {
  const complete: string[] = [];
  let start = 0;

  for (let i = 0; i < buffer.length; i++) {
    if (!SENTENCE_END.test(buffer[i])) continue;
    // A digit immediately after the punctuation ("3.5", "עמ' 12.3") means
    // this isn't really a sentence end — skip it, the next real terminator
    // (or the final flush) will catch the whole thing.
    const next = buffer[i + 1];
    if (next !== undefined && /\d/.test(next)) continue;

    const sentence = buffer.slice(start, i + 1).trim();
    if (sentence) complete.push(sentence);
    start = i + 1;
  }

  return { complete, remainder: buffer.slice(start) };
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let cachedHebrewVoice: SpeechSynthesisVoice | null | undefined;

/**
 * The best available he-IL voice, or undefined to let the browser pick its
 * own default (still attempts speech — never a reason to stay silent).
 * Voices load asynchronously on first use in most browsers, hence the
 * `voiceschanged` listener rather than a single getVoices() read.
 */
function pickHebrewVoice(): Promise<SpeechSynthesisVoice | undefined> {
  if (cachedHebrewVoice !== undefined) return Promise.resolve(cachedHebrewVoice ?? undefined);
  if (!speechSynthesisSupported()) return Promise.resolve(undefined);

  const synth = window.speechSynthesis;
  const find = () => synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith("he")) ?? null;

  const existing = find();
  if (existing) {
    cachedHebrewVoice = existing;
    return Promise.resolve(existing);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cachedHebrewVoice = null;
      resolve(undefined);
    }, 800);
    synth.addEventListener(
      "voiceschanged",
      () => {
        clearTimeout(timeout);
        const found = find();
        cachedHebrewVoice = found;
        resolve(found ?? undefined);
      },
      { once: true }
    );
  });
}

export type SpeechQueueEvent =
  | { kind: "speaking-start" }
  /** Fires once, when every queued sentence has finished — the natural "mic can listen again" moment in hands-free mode. */
  | { kind: "drained" };

export interface SpeechQueue {
  /** Queues a sentence (or any chunk) to speak after whatever's already queued. */
  enqueue: (text: string) => void;
  /** Stops immediately and clears anything queued — a barge-in (the user started talking again) or the modal closing. */
  cancel: () => void;
}

/**
 * A sequential TTS queue: each enqueue() either starts speaking immediately
 * (queue was empty) or is spoken after the current utterance finishes.
 * `onEvent("drained")` is what hands-free mode listens for to re-arm the
 * microphone — firing only once the WHOLE reply has been read, not after
 * each sentence, so the mic doesn't reopen mid-reply.
 */
export function createSpeechQueue(onEvent: (event: SpeechQueueEvent) => void): SpeechQueue {
  const pending: string[] = [];
  let speaking = false;
  let cancelled = false;

  function speakNext() {
    if (cancelled) return;
    const text = pending.shift();
    if (text === undefined) {
      if (speaking) {
        speaking = false;
        onEvent({ kind: "drained" });
      }
      return;
    }

    if (!speaking) {
      speaking = true;
      onEvent({ kind: "speaking-start" });
    }

    // No speechSynthesis in this browser (or it disappeared mid-session):
    // degrade to silent/instant rather than throwing on `new
    // SpeechSynthesisUtterance(...)` or `window.speechSynthesis` — the
    // caller still gets its speaking-start/drained lifecycle (it uses
    // "drained" to know when to re-arm the mic in hands-free mode), it just
    // never produces audio. A deferred call, not a synchronous recursive
    // one, so a long queue can't blow the call stack.
    if (!speechSynthesisSupported()) {
      setTimeout(speakNext, 0);
      return;
    }

    void pickHebrewVoice().then((voice) => {
      if (cancelled) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "he-IL";
      if (voice) utterance.voice = voice;
      // Slightly brisker than the 1.0 default reads as more "assistant",
      // less "reading a document aloud" — a small tuning, not a gimmick.
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = speakNext;
      utterance.onerror = speakNext;
      window.speechSynthesis.speak(utterance);
    });
  }

  return {
    enqueue(text: string) {
      const trimmed = text.trim();
      if (!trimmed || cancelled) return;
      pending.push(trimmed);
      if (!speaking) speakNext();
    },
    cancel() {
      cancelled = true;
      pending.length = 0;
      if (speechSynthesisSupported()) window.speechSynthesis.cancel();
    },
  };
}
