// Web Speech API wrapper for עוזר קולי, plus a mic analyser for
// AudioWaveVisualizer.tsx. A separate module from hooks/useVoiceInput.ts
// (used by the AI Command Panel's mic button) rather than an extension of
// it: that hook is deliberately minimal — final results only, appended to an
// existing text field, never auto-sent — because it augments a text input
// that already has its own submit step. The Assistant IS the input: it needs
// interim (in-progress) results to show live "…as I speak" transcription,
// and a raw mic stream to drive the wave visualizer, neither of which the
// simpler hook has any reason to grow.
//
// Progressive enhancement only: SpeechRecognition is Chrome/Edge-only today,
// so supported() gates whether the mic path renders at all — everywhere the
// mic isn't available (Firefox/Safari, no permission, no device) falls
// through to the text fallback the Assistant always offers, never a broken
// control.

import { startSilenceTimer } from "@/lib/voice/silenceTimer";

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
}
interface SpeechRecognitionResultLike {
  0: { transcript: string };
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}
interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const { SpeechRecognition, webkitSpeechRecognition } = window as unknown as SpeechWindow;
  return SpeechRecognition ?? webkitSpeechRecognition ?? null;
}

/** Whether the browser can attempt live speech recognition at all — gates whether the Assistant's mic button renders as active or as a straight-to-text-fallback control. */
export function speechRecognitionSupported(): boolean {
  return getRecognitionConstructor() !== null;
}

export interface TranscriptUpdate {
  /** Everything recognized so far in this session, interim included — what to show live. */
  transcript: string;
  /** True once this chunk of speech is finalized (a pause was detected). */
  isFinal: boolean;
}

export interface VoiceRecognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

// How long to wait, after the last sign the person is still talking, before
// treating the turn as over and force-finalizing it ourselves. Chrome's own
// built-in pause detection before it fires `onend` runs several seconds
// longer than this — noticeable, "is it broken?" dead air in a voice
// conversation — so this timer, not the browser's, is what actually decides
// when a turn ends. Two independent signals reset it, either is enough on
// its own: a new recognition result (interim or final — see onresult below)
// and, redundantly, the mic's own audio level (see startLevelWatch) for the
// stretch where the recognizer has gone quiet but the person might still be
// mid-word.
const RESULT_SILENCE_MS = 700;
const AUDIO_LEVEL_THRESHOLD = 0.06;
const AUDIO_POLL_MS = 100;

/**
 * Starts a continuous, interim-results Hebrew recognition session.
 * onUpdate fires on every partial result (live transcript) and again,
 * isFinal: true, each time a pause finalizes a chunk; onEnd fires exactly
 * once per session — whether the browser ended it natively (silence
 * timeout, an error) or this module force-finalized it early — never thrown
 * from here, since a dropped connection or denied permission is routine,
 * not exceptional, for a microphone.
 *
 * onEnd firing more than once for a single session was a real, live bug:
 * Chrome routinely fires BOTH `onerror` and `onend` for one terminated
 * session (an error ends the session, and ending the session fires `onend`
 * too), and both were wired to the same callback — so a caller that reacts
 * to "recognition ended" by finalizing and submitting the transcript did
 * that twice for one utterance. Guarded here, at the source, with a
 * fire-once latch (`ended`), rather than only downstream — every caller
 * gets the fix for free instead of each needing its own guard against a
 * platform quirk that has nothing to do with what they're building.
 */
export function startVoiceRecognition(onUpdate: (update: TranscriptUpdate) => void, onEnd: (reason: "stopped" | "error" | "silence") => void): VoiceRecognizer | null {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = "he-IL";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";
  let ended = false;
  // Created lazily, on the first sign the person has actually started
  // talking (the first recognition result, or the first above-threshold mic
  // level) — not armed at construction. Arming it immediately would mean
  // "pressed the mic but took a beat before the first word" gets treated as
  // silence and cut off before anything was even said; before that first
  // sign of speech, this module leaves the browser's own (much longer,
  // undisturbed) no-speech handling in charge, same as before this change.
  // From the first sign onward, either signal — a fresh result, or the mic
  // level staying above the noise floor — pings it and pushes the deadline
  // back out.
  let silence: ReturnType<typeof startSilenceTimer> | null = null;
  let levelWatch: { stop: () => void } | null = null;

  function pingSilenceTimer() {
    if (!silence) {
      silence = startSilenceTimer(RESULT_SILENCE_MS, () => {
        try {
          recognition.stop();
        } catch {
          // Already stopped/stopping — finish() below is what actually matters.
        }
      });
    } else {
      silence.ping();
    }
  }

  function finish(reason: "stopped" | "error" | "silence") {
    if (ended) return;
    ended = true;
    silence?.cancel();
    levelWatch?.stop();
    levelWatch = null;
    onEnd(reason);
  }

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalTranscript += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    onUpdate({ transcript: (finalTranscript + interim).trim(), isFinal: interim.length === 0 && finalTranscript.length > 0 });
    pingSilenceTimer();
  };
  recognition.onerror = () => finish("error");
  recognition.onend = () => finish("stopped");

  try {
    recognition.start();
  } catch {
    return null;
  }

  // Redundant, audio-level backed silence detection: covers the stretch
  // where the recognizer hasn't produced a result in a while (mid-word, or
  // just a slower cadence) but the mic level says the person stopped
  // talking anyway. A second, independent stream from the one
  // AudioWaveVisualizer.tsx opens for its own display — browsers allow more
  // than one concurrent consumer of the same device, and keeping this
  // module self-contained (it can run with no visualizer mounted at all)
  // is worth the one extra stream. Best-effort: if the mic can't be opened
  // a second time for any reason, recognition still works via the
  // result-based timer above alone.
  void startLevelWatch(() => pingSilenceTimer())
    .then((watch) => {
      if (ended) watch?.stop();
      else levelWatch = watch;
    })
    .catch(() => undefined);

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}

/**
 * Polls the mic level and calls `onSpeechLike` whenever it's above the noise
 * floor. There's no separate "below threshold" branch: staying quiet isn't
 * itself an action, it's the ABSENCE of one — the caller's own silence timer
 * (armSilenceTimer) already elapses on its own once nothing resets it, from
 * either this or a fresh recognition result, whichever last happened.
 * Returns null if the mic can't be opened.
 */
async function startLevelWatch(onSpeechLike: () => void): Promise<{ stop: () => void } | null> {
  let analyser: MicAnalyser;
  try {
    analyser = await createMicAnalyser();
  } catch {
    return null;
  }

  const interval = setInterval(() => {
    const levels = analyser.getLevels(8);
    if (Math.max(...levels) >= AUDIO_LEVEL_THRESHOLD) onSpeechLike();
  }, AUDIO_POLL_MS);

  return {
    stop() {
      clearInterval(interval);
      analyser.stop();
    },
  };
}

// --- Mic-level analyser, for AudioWaveVisualizer.tsx and the VAD above ------

export interface MicAnalyser {
  getLevels: (bucketCount: number) => number[];
  /** Stops the mic track and closes the audio graph — must be called on modal close, or the recording indicator/mic light stays on. */
  stop: () => void;
}

/**
 * Opens the microphone and returns a small analyser the visualizer can poll
 * on every animation frame. Rejects if permission is denied or no device
 * exists — the caller falls back to a static/idle visual, not a crash.
 */
export async function createMicAnalyser(): Promise<MicAnalyser> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Web Audio API unavailable");
  }

  const context = new Ctor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 128;
  analyser.smoothingTimeConstant = 0.7;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  return {
    getLevels(bucketCount: number) {
      analyser.getByteFrequencyData(data);
      const levels: number[] = [];
      const bucketSize = Math.max(1, Math.floor(data.length / bucketCount));
      for (let i = 0; i < bucketCount; i++) {
        let sum = 0;
        const start = i * bucketSize;
        for (let j = start; j < start + bucketSize && j < data.length; j++) sum += data[j];
        levels.push(sum / bucketSize / 255);
      }
      return levels;
    },
    stop() {
      stream.getTracks().forEach((t) => t.stop());
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
    },
  };
}
