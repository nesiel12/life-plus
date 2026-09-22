"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { createMicAnalyser, type MicAnalyser } from "@/lib/voice/speechRecognition";

const BAR_COUNT = 24;

/**
 * A live microphone spectrum: opens its own mic stream via getUserMedia +
 * AnalyserNode while `active`, polls it on every animation frame, and draws
 * it as a row of bars whose heights track the audio's actual volume per
 * frequency bucket — not a canned "listening" loop animation. Renders a
 * gentle idle pulse (no mic access) instead when the stream can't be opened
 * (permission denied, no device, or `prefers-reduced-motion`, where a
 * flickering spectrum is exactly the kind of motion that setting asks to
 * avoid) — never a broken or blank control.
 */
export function AudioWaveVisualizer({ active }: { active: boolean }) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([]);
  const analyserRef = useRef<MicAnalyser | null>(null);
  const frameRef = useRef<number | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!active || reduceMotion) return;
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
  }, [active, reduceMotion]);

  if (!active || reduceMotion) {
    return (
      <div className="flex h-16 items-center justify-center gap-1" aria-hidden>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-accent-faith/40"
            style={{ height: 6 }}
            animate={active ? { opacity: [0.4, 0.8, 0.4] } : { opacity: 0.4 }}
            transition={{ duration: 1.4, repeat: active ? Infinity : 0, delay: i * 0.03, ease: "easeInOut" }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-16 items-end justify-center gap-1" aria-hidden role="presentation">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            barRefs.current[i] = el;
          }}
          className="h-14 w-1 origin-bottom rounded-full bg-gradient-to-t from-accent-faith to-accent-knowledge will-change-transform"
          style={{ transform: "scaleY(0.08)" }}
        />
      ))}
    </div>
  );
}
