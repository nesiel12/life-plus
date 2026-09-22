"use client";

import { useEffect, useMemo, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { createMicAnalyser, type MicAnalyser } from "@/lib/voice/speechRecognition";
import { cn } from "@/lib/utils";

const BAR_COUNT = 24;

interface AudioWaveVisualizerProps {
  active: boolean;
  /**
   * "mic" (default): opens a real getUserMedia + AnalyserNode stream and
   * draws the person's actual volume per frequency bucket. "synthetic": no
   * microphone involved — window.speechSynthesis exposes no analyzable
   * audio stream, so the assistant's own "speaking" visual is a smooth
   * animated pulse instead, in a distinct color so the two are never
   * mistaken for each other (the live call interface shows both side by
   * side — VoiceAssistantModal.tsx).
   */
  source?: "mic" | "synthetic";
}

/**
 * A live audio spectrum. In "mic" mode: opens its own mic stream while
 * `active`, polls it on every animation frame, and draws a row of bars whose
 * heights track the audio's actual volume — not a canned loop. Renders a
 * gentle idle pulse (no mic access) instead when the stream can't be opened
 * (permission denied, no device, or `prefers-reduced-motion`, where a
 * flickering spectrum is exactly the kind of motion that setting asks to
 * avoid) — never a broken or blank control. In "synthetic" mode, skips the
 * mic entirely and animates a pulse for the same reason.
 */
export function AudioWaveVisualizer({ active, source = "mic" }: AudioWaveVisualizerProps) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const analyserRef = useRef<MicAnalyser | null>(null);
  const frameRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  // Stable per-bar timing so a re-render doesn't restart every bar's phase
  // from scratch — computed once, not on every render.
  const barSeeds = useMemo(() => Array.from({ length: BAR_COUNT }, () => 0.6 + Math.random() * 0.8), []);

  const isMic = source === "mic";

  useEffect(() => {
    if (!isMic || !active || reduceMotion) return;
    let cancelled = false;

    createMicAnalyser()
      .then((analyser) => {
        if (cancelled) {
          analyser.stop();
          return;
        }
        analyserRef.current = analyser;
        const tick = () => {
          const levels = analyser.getLevels(BAR_COUNT);
          levels.forEach((level, i) => {
            const bar = barRefs.current[i];
            if (bar) bar.style.transform = `scaleY(${Math.max(0.08, level)})`;
          });
          frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
      })
      .catch(() => {
        // No mic access — the idle pulse below covers this; nothing to draw.
      });

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      analyserRef.current?.stop();
      analyserRef.current = null;
    };
  }, [isMic, active, reduceMotion]);

  const barColor = isMic ? "bg-gradient-to-t from-accent-faith to-accent-knowledge" : "bg-gradient-to-t from-gold to-accent-learning";
  const idleColor = isMic ? "bg-accent-faith/40" : "bg-gold/40";

  // Real mic analysis (active + supported + motion allowed): bars driven
  // directly by DOM style writes from the rAF loop above, not React state —
  // a re-render per audio frame would be wasteful for something this
  // continuous.
  if (isMic && active && !reduceMotion) {
    return (
      <div className="flex h-16 items-end justify-center gap-1" aria-hidden role="presentation">
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              barRefs.current[i] = el;
            }}
            className={cn("h-14 w-1 origin-bottom rounded-full will-change-transform", barColor)}
            style={{ transform: "scaleY(0.08)" }}
          />
        ))}
      </div>
    );
  }

  // Synthetic "speaking" pulse, or the idle state for either source: a
  // smooth Framer Motion animation, no real signal to draw.
  return (
    <div className="flex h-16 items-center justify-center gap-1" aria-hidden role="presentation">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <motion.div
          key={i}
          className={cn("w-1 rounded-full", active ? barColor : idleColor)}
          style={{ height: 6 }}
          animate={
            reduceMotion
              ? { opacity: active ? 0.7 : 0.4 }
              : active
                ? { scaleY: [0.3, barSeeds[i] * 2.2, 0.5, barSeeds[i] * 1.6, 0.3], opacity: 1 }
                : { opacity: [0.4, 0.8, 0.4] }
          }
          transition={
            active
              ? { duration: 0.9 + barSeeds[i] * 0.5, repeat: reduceMotion ? 0 : Infinity, ease: "easeInOut", delay: i * 0.02 }
              : { duration: 1.4, repeat: reduceMotion ? 0 : Infinity, delay: i * 0.03, ease: "easeInOut" }
          }
        />
      ))}
    </div>
  );
}
