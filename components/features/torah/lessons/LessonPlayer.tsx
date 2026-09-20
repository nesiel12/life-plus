"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { youtubeVideoId } from "@/lib/learning/youtube";
import { loadYoutubeApi, YT_PLAYING, type YTPlayer } from "@/lib/media/youtubePlayer";

/** What the lesson page can do to the media, whatever the media is. */
export interface LessonPlayerHandle {
  seek(seconds: number, autoplay?: boolean): void;
  pause(): void;
  play(): void;
}

interface LessonPlayerProps {
  kind: "audio" | "youtube" | "pdf";
  mediaUrl: string | null;
  title: string;
  /** Called about four times a second while playing, and on every seek. */
  onTime: (seconds: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}


/**
 * The lesson's media, behind one small interface — seek, play, pause, and a
 * stream of the current time — so the transcript, chapters, sources and
 * practice pauses work the same over an uploaded recording and a YouTube
 * video.
 *
 * YouTube runs through the IFrame Player API (on the privacy-enhanced
 * youtube-nocookie host) because a plain embed cannot report its position,
 * and following along is the point.
 */
export const LessonPlayer = forwardRef<LessonPlayerHandle, LessonPlayerProps>(function LessonPlayer(
  { kind, mediaUrl, title, onTime, onPlayingChange },
  ref
) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const youtubeHost = useRef<HTMLDivElement>(null);
  const youtubePlayer = useRef<YTPlayer | null>(null);
  const pendingSeek = useRef<{ seconds: number; autoplay: boolean } | null>(null);
  const [youtubeError, setYoutubeError] = useState(false);

  const onTimeRef = useRef(onTime);
  const onPlayingRef = useRef(onPlayingChange);
  onTimeRef.current = onTime;
  onPlayingRef.current = onPlayingChange;

  const videoId = kind === "youtube" && mediaUrl ? youtubeVideoId(mediaUrl) : null;

  useImperativeHandle(
    ref,
    () => ({
      seek(seconds, autoplay = true) {
        const target = Math.max(0, seconds);
        if (kind === "audio" && audioRef.current) {
          audioRef.current.currentTime = target;
          onTimeRef.current(target);
          if (autoplay) void audioRef.current.play().catch(() => undefined);
        } else if (youtubePlayer.current) {
          youtubePlayer.current.seekTo(target, true);
          onTimeRef.current(target);
          if (autoplay) youtubePlayer.current.playVideo();
        } else {
          pendingSeek.current = { seconds: target, autoplay };
        }
      },
      pause() {
        audioRef.current?.pause();
        youtubePlayer.current?.pauseVideo();
      },
      play() {
        void audioRef.current?.play().catch(() => undefined);
        youtubePlayer.current?.playVideo();
      },
    }),
    [kind]
  );

  // YouTube: create the player and poll its clock while it plays.
  useEffect(() => {
    if (!videoId || !youtubeHost.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    const mount = document.createElement("div");
    youtubeHost.current.replaceChildren(mount);

    loadYoutubeApi()
      .then((YT) => {
        if (cancelled) return;
        youtubePlayer.current = new YT.Player(mount, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          playerVars: { rel: 0, modestbranding: 1, playsinline: 1, hl: "he" },
          events: {
            onReady: () => {
              const seek = pendingSeek.current;
              if (seek) {
                youtubePlayer.current?.seekTo(seek.seconds, true);
                if (seek.autoplay) youtubePlayer.current?.playVideo();
                pendingSeek.current = null;
              }
            },
            onStateChange: (event) => {
              const playing = event.data === YT_PLAYING;
              onPlayingRef.current?.(playing);
              if (timer) clearInterval(timer);
              timer = null;
              if (playing) {
                timer = setInterval(() => {
                  const time = youtubePlayer.current?.getCurrentTime();
                  if (typeof time === "number") onTimeRef.current(time);
                }, 250);
              }
            },
          },
        });
      })
      .catch(() => setYoutubeError(true));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      youtubePlayer.current?.destroy();
      youtubePlayer.current = null;
    };
  }, [videoId]);

  if (kind === "youtube") {
    return (
      <div className="overflow-hidden rounded-2xl border border-hairline-card bg-black shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6)]">
        <div ref={youtubeHost} className="aspect-video w-full [&_iframe]:size-full" aria-label={title} />
        {youtubeError && (
          <p className="bg-surface p-3 text-xs text-accent-family">נגן YouTube לא נטען. בדוק את החיבור ורענן את הדף.</p>
        )}
      </div>
    );
  }

  if (kind === "audio" && mediaUrl) {
    return (
      <div className="rounded-2xl border border-hairline-card bg-surface p-3 shadow-sm">
        {/* preload="metadata": duration and seeking without downloading the whole shiur. */}
        <audio
          ref={audioRef}
          src={mediaUrl}
          controls
          preload="metadata"
          className="w-full"
          aria-label={title}
          onTimeUpdate={(e) => onTimeRef.current(e.currentTarget.currentTime)}
          onSeeked={(e) => onTimeRef.current(e.currentTarget.currentTime)}
          onPlay={() => onPlayingRef.current?.(true)}
          onPause={() => onPlayingRef.current?.(false)}
          onLoadedMetadata={() => {
            const seek = pendingSeek.current;
            if (seek && audioRef.current) {
              audioRef.current.currentTime = seek.seconds;
              if (seek.autoplay) void audioRef.current.play().catch(() => undefined);
              pendingSeek.current = null;
            }
          }}
        />
      </div>
    );
  }

  return null;
});
