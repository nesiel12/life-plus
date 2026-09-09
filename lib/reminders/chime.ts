"use client";

// A short repeating alarm tone synthesised with the Web Audio API — no audio
// asset to ship, load, or fail to load. `startChime` returns a stop handle;
// the caller MUST call it (on dismiss, on unmount) or the loop runs until the
// tab closes.

export function startChime(): () => void {
  if (typeof window === "undefined") return () => {};

  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return () => {};

  let ctx: AudioContext;
  try {
    ctx = new AudioCtx();
  } catch {
    return () => {};
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const beep = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    // Two quick tones, a gentle "ding-ding".
    for (const [offset, freq] of [
      [0, 880],
      [0.18, 1174],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.18);
    }
    timer = setTimeout(beep, 1600);
  };

  // Autoplay policy: resume() may reject if there was no gesture. The alarm
  // banner still shows either way.
  void ctx.resume().catch(() => {});
  beep();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    ctx.close().catch(() => {});
  };
}
