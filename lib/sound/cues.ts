// Sound cues for practice — tiny synthesized tones, no audio files.
//
// The note plans are pure (and tested); `playCue` is the thin Web Audio layer.
// Cues rise in pitch as the combo grows, so a streak can be *heard* building.
// Everything is short (<400ms), quiet, and off when the learner mutes it.

export type CueEvent = "correct" | "shaky" | "miss" | "tier-up" | "finish";

export interface Note {
  /** Hz */
  freq: number;
  /** Seconds from the cue's start. */
  at: number;
  duration: number;
  gain: number;
  type: "sine" | "triangle";
}

/** A major-pentatonic ladder — every combination sounds consonant. */
const LADDER = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

export function cuePlan(event: CueEvent, streak = 0): Note[] {
  const step = Math.min(LADDER.length - 1, Math.max(0, streak - 1));
  switch (event) {
    case "correct":
      return [
        { freq: LADDER[step], at: 0, duration: 0.12, gain: 0.08, type: "sine" },
        { freq: LADDER[Math.min(LADDER.length - 1, step + 2)], at: 0.07, duration: 0.16, gain: 0.07, type: "sine" },
      ];
    case "shaky":
      return [{ freq: 440, at: 0, duration: 0.14, gain: 0.05, type: "triangle" }];
    case "miss":
      return [
        { freq: 311.13, at: 0, duration: 0.16, gain: 0.06, type: "triangle" },
        { freq: 261.63, at: 0.12, duration: 0.22, gain: 0.05, type: "triangle" },
      ];
    case "tier-up":
      return [0, 2, 4, 5].map((offset, i) => ({
        freq: LADDER[Math.min(LADDER.length - 1, offset + Math.min(2, Math.floor(streak / 4)))],
        at: i * 0.06,
        duration: 0.18,
        gain: 0.07,
        type: "sine" as const,
      }));
    case "finish":
      return [0, 2, 4, 7].map((index, i) => ({ freq: LADDER[index], at: i * 0.09, duration: 0.3, gain: 0.07, type: "sine" as const }));
  }
}

let context: AudioContext | null = null;

/** Plays a cue. Silently does nothing where Web Audio is unavailable. */
export function playCue(event: CueEvent, streak = 0): void {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    const start = context.currentTime + 0.01;
    for (const note of cuePlan(event, streak)) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = note.type;
      osc.frequency.value = note.freq;
      // A soft attack and exponential release — a chime, not a beep.
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.duration);
      osc.connect(gain).connect(context.destination);
      osc.start(start + note.at);
      osc.stop(start + note.at + note.duration + 0.05);
    }
  } catch {
    // Audio is decoration; never let it break a session.
  }
}

const MUTE_KEY = "lifeplus.practice.muted";

export function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // ignore
  }
}
