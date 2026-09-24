"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Headphones, Pause, Play, Square } from "lucide-react";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { cn } from "@/lib/utils";

const SPEEDS = [1, 1.25, 1.5] as const;
type Speed = (typeof SPEEDS)[number];
const BARS = [0.55, 0.9, 0.7, 1, 0.6, 0.85, 0.5];

function hebrewVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith("he")) ?? null;
}

/**
 * Audio narration of the step — "podcast mode" — through the browser's own
 * speech engine: no audio generation cost, works offline, starts instantly.
 * Honest about its limit: without a Hebrew voice on the device it says so
 * instead of reading Hebrew in an English voice.
 *
 * Changing speed mid-sentence restarts from the last word boundary the engine
 * reported, since an utterance's rate can't change once it is speaking. The
 * waveform is scaleY/opacity only; under reduced motion it is a static bar
 * row that dims when paused.
 */
export const NarrationPlayer = memo(function NarrationPlayer({ text, title }: { text: string; title: string }) {
  const reduce = useLabReducedMotion();
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<"idle" | "playing" | "paused">("idle");
  const [speed, setSpeed] = useState<Speed>(1);
  const offsetRef = useRef(0); // chars already spoken, for resuming at a new speed
  const baseRef = useRef(0);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    const pick = () => setVoice(hebrewVoice());
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, []);

  // A new step's text: stop reading the old one.
  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    offsetRef.current = 0;
    setStatus("idle");
  }, [text]);

  const speakFrom = useCallback(
    (offset: number, rate: Speed) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.slice(offset));
      u.lang = "he-IL";
      if (voice) u.voice = voice;
      u.rate = rate;
      baseRef.current = offset;
      u.onboundary = (e) => {
        offsetRef.current = baseRef.current + e.charIndex;
      };
      u.onend = () => {
        offsetRef.current = 0;
        setStatus("idle");
      };
      u.onerror = () => setStatus("idle");
      synth.speak(u);
      setStatus("playing");
    },
    [text, voice]
  );

  function toggle() {
    const synth = window.speechSynthesis;
    if (status === "playing") {
      synth.pause();
      setStatus("paused");
    } else if (status === "paused") {
      synth.resume();
      setStatus("playing");
    } else {
      speakFrom(0, speed);
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    offsetRef.current = 0;
    setStatus("idle");
  }

  function changeSpeed(next: Speed) {
    setSpeed(next);
    if (status !== "idle") speakFrom(offsetRef.current, next);
  }

  if (!supported) return null;
  const noVoice = !voice;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline-card bg-surface px-3 py-2">
      <Headphones size={16} className="shrink-0 text-accent-learning" aria-hidden />
      <button
        type="button"
        onClick={toggle}
        disabled={noVoice}
        aria-label={status === "playing" ? `השהה הקראה של ${title}` : `הקרא את ${title}`}
        className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-accent-learning text-background transition-opacity disabled:opacity-40"
      >
        {status === "playing" ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
      </button>
      {status !== "idle" && (
        <button type="button" onClick={stop} aria-label="עצור הקראה" className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-fill-subtle text-muted hover:text-foreground">
          <Square size={14} aria-hidden />
        </button>
      )}

      <div aria-hidden className="flex h-8 items-center gap-[3px]">
        {BARS.map((h, i) => (
          <span
            key={i}
            className={cn(
              "w-[3px] origin-center rounded-full bg-accent-learning transition-opacity",
              status === "playing" && !reduce && "animate-[narration-wave_0.9s_ease-in-out_infinite]",
              status === "playing" ? "opacity-100" : "opacity-35"
            )}
            style={{ height: "100%", transform: `scaleY(${h * 0.45})`, animationDelay: `${i * 0.11}s`, ["--amp" as string]: h }}
          />
        ))}
      </div>

      <div role="radiogroup" aria-label="מהירות הקראה" className="ms-auto flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            disabled={noVoice}
            onClick={() => changeSpeed(s)}
            className={cn(
              "focus-ring ltr min-h-11 min-w-11 rounded-full px-2 text-xs font-semibold tabular-nums transition-colors disabled:opacity-40",
              speed === s ? "bg-accent-learning/15 text-accent-learning" : "text-muted hover:text-foreground"
            )}
          >
            {s}x
          </button>
        ))}
      </div>
      {noVoice && <p className="w-full text-[11px] text-muted">אין קול עברי מותקן במכשיר הזה, ולכן ההקראה לא זמינה כאן.</p>}
    </div>
  );
});
