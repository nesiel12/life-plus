"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playCue, primeAudio, readMuted, writeMuted, type CueEvent } from "@/lib/sound/cues";

// Sound for the learning lab: a thin hook over the shared cue synthesizer
// (lib/sound/cues.ts — tiny synthesized tones, no audio files, all quiet and
// under 0.7s). It adds the one thing the lab needs on top: a mute switch that is
// remembered, separately from the practice battle's, so silencing one does not
// silently silence the other.

const MUTE_KEY = "lifeplus.learning.muted";

export function useLearningAudio() {
  const [muted, setMuted] = useState(false);
  // A ref alongside the state: `play` is called from timers and event handlers
  // that must see the *current* setting, and must stay a stable function so the
  // effects that depend on it never re-run.
  const mutedRef = useRef(false);

  // localStorage only exists in the browser, so the saved choice is read after mount.
  useEffect(() => {
    const saved = readMuted(MUTE_KEY);
    mutedRef.current = saved;
    setMuted(saved);
  }, []);

  const play = useCallback((event: CueEvent, step = 0) => {
    if (!mutedRef.current) playCue(event, step);
  }, []);

  /** Call from a click handler before anything plays from a timer (see primeAudio). */
  const prime = useCallback(() => {
    if (!mutedRef.current) primeAudio();
  }, []);

  const toggleMuted = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    writeMuted(next, MUTE_KEY);
    // Turning sound back on is a gesture, so confirm it with a sound.
    if (!next) playCue("pop");
  }, []);

  return { muted, play, prime, toggleMuted };
}
