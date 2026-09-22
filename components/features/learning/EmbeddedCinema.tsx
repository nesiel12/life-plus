"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Expand, Maximize2, Minimize2, Pause, Play } from "lucide-react";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { loadYoutubeApi, YT_ENDED, YT_PLAYING, type YTPlayer } from "@/lib/media/youtubePlayer";
import { formatClock } from "@/lib/learning/youtubeInput";
import { isWatched, parseSavedPosition, resumePoint, videoErrorMessage, type SavedPosition } from "@/lib/learning/videoProgress";
import { youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/learning/youtube";
import { cn } from "@/lib/utils";

interface EmbeddedCinemaProps {
  videoId: string;
  title: string;
  /** A start time from the link itself, which wins over a saved position. */
  startSeconds?: number;
  /** Called once when the video has been watched (90%) — the caller marks it done. */
  onWatched: () => void;
  /** Whether the resource it belongs to is already complete. */
  alreadyWatched: boolean;
  theater: boolean;
  onToggleTheater: () => void;
}

const POLL_MS = 1000;
const SAVE_KEY = (videoId: string) => `lifeplus.learning.video.${videoId}`;

function readSaved(videoId: string): SavedPosition | null {
  try {
    return parseSavedPosition(JSON.parse(localStorage.getItem(SAVE_KEY(videoId)) ?? "null"));
  } catch {
    return null;
  }
}

function writeSaved(videoId: string, saved: SavedPosition): void {
  try {
    localStorage.setItem(SAVE_KEY(videoId), JSON.stringify(saved));
  } catch {
    // Resuming is a convenience; losing it is fine.
  }
}

/**
 * The video player inside the topic canvas.
 *
 * The YouTube player is created only when the person presses play, so nothing
 * loads from YouTube (no script, no cookies) until they ask for it. While it
 * plays, its position is saved and resumed next time, and watching 90% of it
 * tells the caller the resource is done — through the same path as a tick, so it
 * earns the same reaction.
 *
 * A blurred copy of the thumbnail glows behind the frame; the play/pause control
 * morphs between its states rather than swapping.
 */
export function EmbeddedCinema({ videoId, title, startSeconds = 0, onWatched, alreadyWatched, theater, onToggleTheater }: EmbeddedCinemaProps) {
  const reduce = useLabReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const watchedRef = useRef(alreadyWatched);
  const onWatchedRef = useRef(onWatched);
  onWatchedRef.current = onWatched;

  const [phase, setPhase] = useState<"poster" | "loading" | "ready">("poster");
  const [playing, setPlaying] = useState(false);
  const [fraction, setFraction] = useState(0);
  const [watched, setWatched] = useState(alreadyWatched);
  // Why the player could not run, in words; null while there is no problem.
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPosition | null>(null);

  // A new video (or a new topic) starts over from its poster.
  useEffect(() => {
    watchedRef.current = alreadyWatched;
    setWatched(alreadyWatched);
    setPhase("poster");
    setPlaying(false);
    setFraction(0);
    setFailure(null);
    setSaved(readSaved(videoId));
    // The mount point is a node React renders but the player fills imperatively,
    // so the cleanup holds on to the very node it was given.
    const mountNode = mountRef.current;
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      mountNode?.replaceChildren();
    };
    // alreadyWatched is read once per video; a completion during playback must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  const markWatched = useCallback(() => {
    if (watchedRef.current) return;
    watchedRef.current = true;
    setWatched(true);
    onWatchedRef.current();
  }, []);

  // Progress sync: once a second while there is a player, read where it is.
  useEffect(() => {
    if (phase !== "ready") return;
    const timer = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const t = player.getCurrentTime();
      const d = player.getDuration();
      if (!(d > 0)) return;
      setFraction(Math.min(1, t / d));
      writeSaved(videoId, { t, d });
      if (isWatched(t, d)) markWatched();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [phase, videoId, markWatched]);

  async function start() {
    if (phase !== "poster") return;
    setPhase("loading");
    setFailure(null);
    try {
      const YT = await loadYoutubeApi();
      const mount = document.createElement("div");
      mountRef.current?.replaceChildren(mount);
      const from = startSeconds > 0 ? startSeconds : resumePoint(readSaved(videoId));
      playerRef.current = new YT.Player(mount, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, start: from },
        events: {
          onReady: () => {
            setPhase("ready");
            playerRef.current?.playVideo();
          },
          onStateChange: (event) => {
            setPlaying(event.data === YT_PLAYING);
            if (event.data === YT_ENDED) markWatched();
          },
          onError: (event) => {
            setFailure(videoErrorMessage(event.data));
            setPhase("poster");
          },
        },
      });
    } catch {
      // The player script itself would not load (offline, blocked).
      setFailure(videoErrorMessage(null));
      setPhase("poster");
    }
  }

  function toggle() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  }

  function fullscreen() {
    void frameRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  const resumeAt = resumePoint(saved);
  const icon = watched ? "done" : playing ? "pause" : "play";

  return (
    <section aria-label={`נגן וידאו: ${title}`} className="flex flex-col gap-3">
      <div className="relative">
        {/* Ambient light: a heavily blurred thumbnail behind the frame. */}
        <div aria-hidden className="pointer-events-none absolute -inset-5 -z-10 overflow-hidden rounded-[2rem] opacity-45">
          <motion.img
            src={youtubeThumbnailUrl(videoId)}
            alt=""
            className="size-full scale-110 object-cover blur-3xl"
            animate={reduce ? undefined : { scale: [1.1, 1.22, 1.1] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <div ref={frameRef} className={cn("relative overflow-hidden rounded-2xl bg-black", theater ? "aspect-video max-h-[70vh] w-full" : "aspect-video w-full")}>
          <div ref={mountRef} className="absolute inset-0 [&_iframe]:size-full" />

          <AnimatePresence>
            {phase !== "ready" && (
              <motion.div key="poster" className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube thumbnail as the poster */}
                <img src={youtubeThumbnailUrl(videoId)} alt="" className="size-full object-cover" />
                <span className="absolute inset-0 bg-black/30" />
                <MagneticButton
                  onClick={() => void start()}
                  disabled={phase === "loading"}
                  aria-label={`נגן: ${title}`}
                  className="absolute left-1/2 top-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-black shadow-2xl"
                >
                  {phase === "loading" ? (
                    <span className="size-6 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                  ) : (
                    <Play size={26} className="ms-1" fill="currentColor" aria-hidden />
                  )}
                </MagneticButton>
                {/* A start time in the link wins over a saved position (see start()). */}
                {(startSeconds > 0 || resumeAt > 0) && phase === "poster" && (
                  <span className="ltr absolute bottom-3 end-3 rounded-lg bg-black/70 px-2.5 py-1 text-xs text-white">
                    {startSeconds > 0 ? `מתחיל ב-${formatClock(startSeconds)}` : `המשך מ-${formatClock(resumeAt)}`}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {failure && (
        <p role="alert" className="text-xs text-accent-family">
          {failure}{" "}
          <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noreferrer" className="focus-ring rounded font-medium underline underline-offset-2">
            אפשר לצפות בו ישירות ב-YouTube
          </a>
        </p>
      )}

      {/* Status strip: synced progress, and the controls that are ours. */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          disabled={phase !== "ready"}
          aria-label={icon === "pause" ? "השהה" : icon === "done" ? "נצפה — הפעל שוב" : "נגן"}
          className="focus-ring grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-accent-learning/15 text-accent-learning transition-opacity disabled:opacity-40"
        >
          {/* The icon morphs: one leaves turning and shrinking as the next arrives. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={icon}
              className="grid place-items-center"
              initial={reduce ? false : { scale: 0.3, rotate: -90, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={reduce ? undefined : { scale: 0.3, rotate: 90, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 24 }}
            >
              {icon === "pause" ? <Pause size={16} fill="currentColor" aria-hidden /> : icon === "done" ? <Check size={17} strokeWidth={3} aria-hidden /> : <Play size={16} className="ms-0.5" fill="currentColor" aria-hidden />}
            </motion.span>
          </AnimatePresence>
        </button>

        <div className="min-w-0 flex-1">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-fill-subtle"
            role="progressbar"
            aria-label="התקדמות בצפייה"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
          >
            <motion.div className="h-full origin-right rounded-full bg-accent-learning" initial={false} animate={{ scaleX: watched ? 1 : fraction }} transition={{ duration: reduce ? 0 : 0.6, ease: "easeOut" }} />
          </div>
          <p className="mt-1 text-[0.7rem] text-muted" aria-live="polite">
            {watched ? "נצפה — השלב סומן כהושלם ✓" : phase === "ready" ? "ההתקדמות נשמרת אוטומטית" : "התקדמות הצפייה נשמרת ומסתנכרנת עם השלב"}
          </p>
        </div>

        <button
          onClick={onToggleTheater}
          aria-pressed={theater}
          aria-label={theater ? "הקטן את הנגן" : "הרחב את הנגן"}
          className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          {theater ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
        </button>
        <button
          onClick={fullscreen}
          aria-label="מסך מלא"
          className="focus-ring grid size-9 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
        >
          <Expand size={16} aria-hidden />
        </button>
      </div>
    </section>
  );
}
