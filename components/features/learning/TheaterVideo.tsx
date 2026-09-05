"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, Play } from "lucide-react";
import { Backlight } from "@/components/magicui/backlight";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/learning/youtube";
import { cn } from "@/lib/utils";

interface TheaterVideoProps {
  videoId: string;
  title?: string;
}

// The course video: click-to-load, backlit, and expandable to fullscreen.
//
// Three things worth stating, because each is a deliberate constraint rather
// than an implementation detail:
//
// 1. The backlight wraps the *poster*, never the playing iframe. The effect
//    is an SVG Gaussian blur, which re-runs on every painted frame of its
//    subtree — over live video that is a full-size blur per frame, on a page
//    whose whole brief was to remove lag. Behind a still image it costs one
//    paint. Once playback starts the glow is dropped entirely.
//
// 2. The iframe is created by the click, not rendered and hidden. That is
//    what satisfies the browser's user-gesture requirement so audio actually
//    plays, and it keeps YouTube's player and cookies off the page for
//    videos nobody opens. Same reasoning as InlineVideoPlayer, which this
//    replaces for the course view.
//
// 3. Fullscreen is requested on the wrapper, not the iframe. Fullscreening
//    the iframe hands the whole screen to YouTube and takes our own controls
//    with it; fullscreening the container keeps them.
export function TheaterVideo({ videoId, title }: TheaterVideoProps) {
  const [playing, setPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Driven by the event, not by our own call: the user can leave fullscreen
  // with Escape or the browser's own control, and state set optimistically
  // at the call site would then be wrong with no way to notice.
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const node = wrapperRef.current;
    if (!node) return;
    try {
      if (document.fullscreenElement === node) {
        await document.exitFullscreen();
      } else {
        await node.requestFullscreen();
      }
    } catch {
      // Fullscreen is refusable — iOS Safari has never supported it on a
      // non-video element, and a permissions policy can block it. The video
      // still plays inline, so this is a missing nicety, not a failure worth
      // interrupting anyone about.
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "relative w-full",
        // In fullscreen the wrapper *is* the screen, so it has to paint its
        // own ground and centre the player rather than inheriting a layout
        // that no longer exists around it.
        isFullscreen && "flex items-center justify-center bg-black p-4"
      )}
    >
      <div className={cn("relative w-full", isFullscreen && "max-h-full max-w-6xl")}>
        {playing ? (
          <div className="aspect-video w-full overflow-hidden rounded-xl border border-hairline-card bg-black">
            <iframe
              src={`${youtubeEmbedUrl(videoId)}?autoplay=1&rel=0&modestbranding=1`}
              title={title ?? "נגן וידאו"}
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : (
          <Backlight blur={26} saturate={2.4} className="w-full">
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={title ? `נגן: ${title}` : "נגן וידאו"}
              className="focus-ring group relative block aspect-video w-full overflow-hidden rounded-xl border border-hairline-card bg-black"
            >
              {/* Plain img, not next/image: the thumbnail host is external
                  and this is a fixed-ratio decorative poster, so the
                  optimiser adds a round trip and buys nothing. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={youtubeThumbnailUrl(videoId)}
                alt=""
                className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              />
              <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/15">
                <span className="grid size-14 place-items-center rounded-full bg-white/90 text-black shadow-lg transition-transform group-hover:scale-105">
                  <Play size={22} className="ms-0.5" aria-hidden />
                </span>
              </span>
            </button>
          </Backlight>
        )}

        <button
          type="button"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? "צא ממסך מלא" : "מסך מלא"}
          className="glass-control focus-ring absolute bottom-2 end-2 grid size-8 place-items-center rounded-lg text-foreground"
        >
          {isFullscreen ? <Minimize2 size={14} aria-hidden /> : <Maximize2 size={14} aria-hidden />}
        </button>
      </div>
    </div>
  );
}
