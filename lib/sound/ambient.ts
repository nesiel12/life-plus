// Ambient soundscapes for the focus timer, synthesized with Web Audio — no
// audio files to download or license. Honest about what they are: shaped
// noise (brown noise, rain, surf), not recorded lo-fi music.

export type AmbientKind = "brown" | "rain" | "waves";

export const AMBIENT_LABEL: Record<AmbientKind, string> = {
  brown: "רעש חום",
  rain: "גשם",
  waves: "גלים",
};

export interface AmbientHandle {
  stop: () => void;
  setVolume: (v: number) => void;
}

function noiseBuffer(ctx: AudioContext, kind: AmbientKind): AudioBuffer {
  const seconds = 4;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (kind === "brown" || kind === "waves") {
      // Integrated white noise — a deep, even rumble.
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white * 0.4;
    }
  }
  return buffer;
}

export function startAmbient(kind: AmbientKind, volume: number): AmbientHandle | null {
  const Ctx = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx, kind);
  source.loop = true;

  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(volume, ctx.currentTime + 1.2); // fade in, never a jolt

  let tail: AudioNode = source;
  if (kind === "rain") {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1400;
    filter.Q.value = 0.6;
    source.connect(filter);
    tail = filter;
  }
  if (kind === "waves") {
    // A slow swell: an LFO on a gain stage, ~9s per wave.
    const swell = ctx.createGain();
    swell.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    source.connect(swell);
    tail = swell;
  }
  tail.connect(master).connect(ctx.destination);
  source.start();

  return {
    stop() {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.4);
      setTimeout(() => void ctx.close().catch(() => undefined), 500);
    },
    setVolume(v: number) {
      master.gain.setTargetAtTime(v, ctx.currentTime, 0.2);
    },
  };
}
