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

/**
 * Starts a continuous, interim-results Hebrew recognition session.
 * onUpdate fires on every partial result (live transcript) and again,
 * isFinal: true, each time a pause finalizes a chunk; onEnd fires when the
 * browser stops listening (silence timeout, stop(), or an error) — never
 * thrown from here, since a dropped connection or denied permission is
 * routine, not exceptional, for a microphone.
 */
export function startVoiceRecognition(onUpdate: (update: TranscriptUpdate) => void, onEnd: (reason: "stopped" | "error") => void): VoiceRecognizer | null {
  const Recognition = getRecognitionConstructor();
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.lang = "he-IL";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = "";

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) finalTranscript += `${result[0].transcript} `;
      else interim += result[0].transcript;
    }
    onUpdate({ transcript: (finalTranscript + interim).trim(), isFinal: interim.length === 0 && finalTranscript.length > 0 });
  };
  recognition.onerror = () => onEnd("error");
  recognition.onend = () => onEnd("stopped");

  try {
    recognition.start();
  } catch {
    return null;
  }

  return {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    abort: () => recognition.abort(),
  };
}

// --- Mic-level analyser, for AudioWaveVisualizer.tsx ------------------------

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
