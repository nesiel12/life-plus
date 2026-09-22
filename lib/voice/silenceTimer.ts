// A restartable "fire once after N ms of nothing" timer — the primitive
// behind עוזר קולי's fast turn-taking: lib/voice/speechRecognition.ts pings
// it on every recognition result and on every above-threshold mic level
// reading, so whichever signal last showed the person was still talking is
// what keeps pushing the deadline out. Pulled out of that module's closures
// into its own pure, dependency-free unit specifically so the actual timing
// behavior — starts, resets on activity, fires exactly once, cancels
// cleanly — is unit-testable with vi.useFakeTimers() instead of only being
// exercisable through a live microphone.

export interface SilenceTimerHandle {
  /** A sign of continued activity — restarts the countdown from `ms`. */
  ping: () => void;
  /** Stops the timer for good; onSilence will not fire after this. */
  cancel: () => void;
}

/**
 * Starts counting down from `ms` immediately, and again from the top every
 * time `ping()` is called. Calls `onSilence()` exactly once, the first time
 * the countdown reaches zero with no intervening ping. A ping after it has
 * already fired, or after cancel(), is a no-op.
 */
export function startSilenceTimer(ms: number, onSilence: () => void): SilenceTimerHandle {
  let fired = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function fire() {
    if (fired) return;
    fired = true;
    timer = null;
    onSilence();
  }

  function arm() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, ms);
  }

  arm();

  return {
    ping() {
      if (fired) return;
      arm();
    },
    cancel() {
      fired = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
