"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, CircleHelp, Loader2, Play, Sparkles, XCircle } from "lucide-react";
import { loadYoutubeApi, YT_PLAYING, type YTPlayer } from "@/lib/media/youtubePlayer";
import { checkpointScore, dueCheckpoint, type CheckpointAnswer } from "@/lib/learning/checkpoints";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { macLaunchVariants } from "@/lib/motion/macLaunch";
import { cn } from "@/lib/utils";

interface PublicCheckpoint {
  id: string;
  atSeconds: number;
  question: string;
  options: string[];
}

interface CheckpointData {
  checkpoints: PublicCheckpoint[];
  answers: Record<string, CheckpointAnswer>;
  revealed: Record<string, { correctIndex: number; explanation: string }>;
}

interface InteractiveVideoLessonProps {
  videoId: string;
  videoUrl: string;
  topicId?: string;
  title: string;
}

const POLL_MS = 250;

/**
 * A YouTube lesson that stops to check understanding.
 *
 * Checkpoints are built once from the video's captions (see
 * app/api/learning/checkpoints). While the video plays, the player's clock is
 * watched; crossing a checkpoint pauses it and lays a question over the video.
 * Only continuous playback triggers a stop — seeking past a checkpoint does
 * not (lib/learning/checkpoints.ts dueCheckpoint). The answer key never
 * reaches the browser before an answer: correctness is decided server-side.
 */
export function InteractiveVideoLesson({ videoId, videoUrl, topicId, title }: InteractiveVideoLessonProps) {
  const reduceMotion = useReducedMotion();
  const mountRef = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const lastTime = useRef(0);
  const [data, setData] = useState<CheckpointData | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<PublicCheckpoint | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<number | null>(null);
  const [result, setResult] = useState<{ correct: boolean; correctIndex: number; explanation: string; choice: number } | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/learning/checkpoints?videoId=${videoId}`, { cache: "no-store" });
      const json = await response.json();
      setData(json.checkpoints ? json : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function build() {
    setBuilding(true);
    setError(null);
    try {
      const response = await fetch("/api/learning/checkpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, topicId }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(typeof json.error === "string" ? json.error : "בניית השיעור נכשלה.");
        return;
      }
      setData(json);
    } catch {
      setError("בניית השיעור נכשלה. בדוק את החיבור.");
    } finally {
      setBuilding(false);
    }
  }

  // The player.
  useEffect(() => {
    let cancelled = false;
    const mount = mountRef.current;
    if (!mount) return;
    const target = document.createElement("div");
    mount.appendChild(target);
    loadYoutubeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(target, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        });
      })
      .catch(() => setError("נגן YouTube לא נטען."));
    return () => {
      cancelled = true;
      player.current?.destroy();
      player.current = null;
      mount.innerHTML = "";
    };
  }, [videoId]);

  // Watch the clock; stop at a checkpoint.
  const handled = useCallback(
    (id: string) => Boolean(data?.answers[id]) || dismissed.has(id),
    [data, dismissed]
  );

  useEffect(() => {
    const tick = window.setInterval(() => {
      const p = player.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      const now = p.getCurrentTime() || 0;
      const previous = lastTime.current;
      lastTime.current = now;
      setTime(now);
      const d = typeof p.getDuration === "function" ? p.getDuration() : 0;
      if (d && d !== duration) setDuration(d);
      if (!data || active || p.getPlayerState() !== YT_PLAYING) return;
      const done = new Set(data.checkpoints.filter((c) => handled(c.id)).map((c) => c.id));
      const due = dueCheckpoint(data.checkpoints, previous, now, done);
      if (due) {
        p.pauseVideo();
        setActive(due);
        setResult(null);
      }
    }, POLL_MS);
    return () => window.clearInterval(tick);
  }, [data, active, handled, duration]);

  async function answer(choice: number) {
    if (!active) return;
    setSubmitting(choice);
    try {
      const response = await fetch("/api/learning/checkpoints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, checkpointId: active.id, choice }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setResult({ correct: json.correct, correctIndex: json.correctIndex, explanation: json.explanation, choice });
      setData({ checkpoints: json.checkpoints, answers: json.answers, revealed: json.revealed });
    } catch {
      setError("התשובה לא נשמרה. נסה שוב.");
    } finally {
      setSubmitting(null);
    }
  }

  function resume() {
    if (active) setDismissed((prev) => new Set(prev).add(active.id));
    setActive(null);
    setResult(null);
    player.current?.playVideo();
  }

  function seek(seconds: number) {
    player.current?.seekTo(seconds, true);
    lastTime.current = seconds;
  }

  const score = data ? checkpointScore(data.checkpoints, data.answers) : null;
  const total = duration || Math.max(...(data?.checkpoints.map((c) => c.atSeconds + 60) ?? [600]));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black shadow-[0_30px_60px_-36px_rgba(0,0,0,0.8)]">
        <div ref={mountRef} className="aspect-video w-full [&_iframe]:size-full" aria-label={`נגן: ${title}`} />

        <AnimatePresence>
          {active && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 grid place-items-center bg-black/55 p-3 backdrop-blur-[3px] sm:p-6"
            >
              <motion.div
                variants={macLaunchVariants(Boolean(reduceMotion))}
                initial="hidden"
                animate="visible"
                exit="exit"
                role="dialog"
                aria-label="בדיקת הבנה"
                className="glass-panel max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-background/95 p-4 sm:p-5"
              >
                <p className="mb-1 flex items-center gap-1.5 text-[0.7rem] font-medium text-gold-ink">
                  <CircleHelp size={12} aria-hidden />
                  נקודת עצירה · <span className="ltr">{formatTimecode(active.atSeconds)}</span>
                </p>
                <p className="mb-3 text-base font-semibold leading-relaxed text-foreground">{active.question}</p>
                <div className="flex flex-col gap-2">
                  {active.options.map((option, i) => {
                    const chosen = result?.choice === i;
                    const isCorrect = result && result.correctIndex === i;
                    return (
                      <motion.button
                        key={i}
                        type="button"
                        disabled={Boolean(result) || submitting !== null}
                        onClick={() => void answer(i)}
                        whileHover={result || reduceMotion ? undefined : { x: -3 }}
                        className={cn(
                          "focus-ring flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-start text-sm transition-colors",
                          result
                            ? isCorrect
                              ? "border-accent-health/60 bg-accent-health/10 text-foreground"
                              : chosen
                                ? "border-accent-family/60 bg-accent-family/10 text-foreground"
                                : "border-hairline-card text-muted"
                            : "border-hairline-card bg-surface text-foreground hover:border-gold-line hover:bg-gold-soft/40"
                        )}
                      >
                        {option}
                        {submitting === i && <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden />}
                        {result && isCorrect && <CheckCircle2 size={16} className="shrink-0 text-accent-health" aria-label="נכון" />}
                        {result && chosen && !isCorrect && <XCircle size={16} className="shrink-0 text-accent-family" aria-label="לא נכון" />}
                      </motion.button>
                    );
                  })}
                </div>
                {result && (
                  <motion.div initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex flex-col gap-3">
                    <p className={cn("text-sm font-semibold", result.correct ? "text-accent-health" : "text-accent-family")}>
                      {result.correct ? "נכון!" : "לא בדיוק."}
                    </p>
                    {result.explanation && <p className="text-sm leading-relaxed text-foreground/85">{result.explanation}</p>}
                  </motion.div>
                )}
                <div className="mt-4 flex justify-end gap-2">
                  {!result && (
                    <button type="button" onClick={resume} className="focus-ring rounded-full px-3 py-1.5 text-xs text-muted hover:text-foreground">
                      דלג
                    </button>
                  )}
                  {result && (
                    <button
                      type="button"
                      onClick={resume}
                      autoFocus
                      className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-sm font-medium text-white"
                    >
                      <Play size={13} className="-scale-x-100" aria-hidden />
                      המשך צפייה
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Checkpoint timeline. */}
      {data && (
        <div className="flex flex-col gap-1.5">
          <div dir="ltr" className="relative h-2 rounded-full bg-fill">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gold/60" style={{ width: `${Math.min(100, (time / total) * 100)}%` }} />
            {data.checkpoints.map((c) => {
              const a = data.answers[c.id];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => seek(Math.max(0, c.atSeconds - 20))}
                  aria-label={`נקודת עצירה ב-${formatTimecode(c.atSeconds)}${a ? (a.correct ? " — נענתה נכון" : " — נענתה") : ""}`}
                  className={cn(
                    "focus-ring absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface transition-transform hover:scale-125",
                    a ? (a.correct ? "bg-accent-health" : "bg-accent-family") : "bg-gold"
                  )}
                  style={{ left: `${Math.min(100, (c.atSeconds / total) * 100)}%` }}
                />
              );
            })}
          </div>
          {score && (
            <p className="text-[0.7rem] text-muted">
              {score.total} נקודות עצירה · {score.answered} נענו · {score.correct} נכון
            </p>
          )}
        </div>
      )}

      {!loading && !data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-gold-line bg-gold-soft/30 px-4 py-3">
          <p className="text-sm text-foreground/85">להפוך את הסרטון לשיעור אינטראקטיבי — הוא יעצור ברגעי מפתח לשאלת הבנה.</p>
          <button
            type="button"
            onClick={() => void build()}
            disabled={building}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            {building ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
            {building ? "בונה נקודות עצירה…" : "צור שיעור אינטראקטיבי"}
          </button>
        </div>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}
