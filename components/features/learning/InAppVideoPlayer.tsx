"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { loadYoutubeApi, YT_PLAYING, type YTPlayer } from "@/lib/media/youtubePlayer";
import { videoErrorMessage } from "@/lib/learning/videoProgress";
import { youtubeThumbnailUrl, youtubeWatchUrl } from "@/lib/learning/youtube";
import type { LessonVideoChapter } from "@/types/learning";
import { cn } from "@/lib/utils";

interface InAppVideoPlayerProps {
  videoId: string;
  title: string;
  chapters?: LessonVideoChapter[] | null;
}

function formatChapterTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;
}

/**
 * The masterclass lesson's video — real YouTube IFrame Player API (same
 * `lib/media/youtubePlayer.ts` EmbeddedCinema.tsx already uses for the
 * syllabus's own video), not a bare `<iframe>`, so chapter rows can call
 * `seekTo()` directly instead of reloading the embed on every click.
 *
 * Deliberately lighter than EmbeddedCinema: no watched-tracking or resume —
 * a masterclass lesson's completion signal is the "סיימתי את השיעור" button,
 * not this player, so there's nothing here that needs to know or report
 * back when the video ends.
 */
export function InAppVideoPlayer({ videoId, title, chapters }: InAppVideoPlayerProps) {
  const reduce = useLabReducedMotion();
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [phase, setPhase] = useState<"poster" | "loading" | "ready">("poster");
  const [playing, setPlaying] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    return () => {
      playerRef.current?.destroy();
      playerRef.current = null;
      mountNode?.replaceChildren();
    };
  }, [videoId]);

  async function start() {
    if (phase !== "poster") return;
    setPhase("loading");
    setFailure(null);
    try {
      const YT = await loadYoutubeApi();
      const mount = document.createElement("div");
      mountRef.current?.replaceChildren(mount);
      playerRef.current = new YT.Player(mount, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1 },
        events: {
          onReady: () => {
            setPhase("ready");
            playerRef.current?.playVideo();
          },
          onStateChange: (event) => setPlaying(event.data === YT_PLAYING),
          onError: (event) => {
            setFailure(videoErrorMessage(event.data));
            setPhase("poster");
          },
        },
      });
    } catch {
      setFailure(videoErrorMessage(null));
      setPhase("poster");
    }
  }

  async function seekTo(seconds: number) {
    if (phase === "poster") await start();
    // start() is async and the player isn't ready the instant it resolves
    // (onReady fires separately) — a chapter clicked before that lands once
    // the player exists, which is close enough for a cold-start click; a
    // player that's already ready seeks immediately.
    playerRef.current?.seekTo(seconds, true);
    playerRef.current?.playVideo();
  }

  function toggle() {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pauseVideo();
    else player.playVideo();
  }

  return (
    <section aria-label={`נגן וידאו: ${title}`} className="flex flex-col gap-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        <div ref={mountRef} className="absolute inset-0 [&_iframe]:size-full" />
        <AnimatePresence>
          {phase !== "ready" && (
            <motion.div key="poster" className="absolute inset-0" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.3 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube thumbnail as the poster */}
              <img src={youtubeThumbnailUrl(videoId)} alt="" className="size-full object-cover" />
              <span className="absolute inset-0 bg-black/30" />
              <MagneticButton
                onClick={() => void start()}
                disabled={phase === "loading"}
                aria-label={`נגן: ${title}`}
                className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-black shadow-2xl"
              >
                {phase === "loading" ? (
                  <span className="size-5 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                ) : (
                  <Play size={22} className="ms-1" fill="currentColor" aria-hidden />
                )}
              </MagneticButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {failure && (
        <p role="alert" className="text-xs text-accent-family">
          {failure}{" "}
          <a href={youtubeWatchUrl(videoId)} target="_blank" rel="noreferrer" className="focus-ring rounded font-medium underline underline-offset-2">
            אפשר לצפות בו ישירות ב-YouTube
          </a>
        </p>
      )}

      {phase === "ready" && (
        <button
          onClick={toggle}
          aria-label={playing ? "השהה" : "נגן"}
          className="focus-ring flex w-fit items-center gap-1.5 rounded-full bg-accent-learning/15 px-3 py-1 text-xs font-medium text-accent-learning"
        >
          {playing ? <Pause size={12} fill="currentColor" aria-hidden /> : <Play size={12} className="ms-0.5" fill="currentColor" aria-hidden />}
          {playing ? "מנגן" : "מושהה"}
        </button>
      )}

      {chapters && chapters.length > 0 && (
        <ul className="flex flex-col gap-1">
          {chapters.map((chapter, i) => (
            <li key={i}>
              <button
                onClick={() => void seekTo(chapter.time)}
                className={cn(
                  "focus-ring flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-xs transition-colors hover:bg-fill-subtle",
                  "text-muted hover:text-foreground"
                )}
              >
                <span className="tabular-nums text-accent-learning">{formatChapterTime(chapter.time)}</span>
                {chapter.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
