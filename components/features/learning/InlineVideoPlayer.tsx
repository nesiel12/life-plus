"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "@/lib/learning/youtube";

interface InlineVideoPlayerProps {
  videoId: string;
  title?: string;
}

// A real embedded player, in place, inside the learning panel — not a modal.
//
// Two deliberate choices behind the click-to-load thumbnail:
//
//  1. It fixes autoplay. A browser blocks programmatic playback without a
//     user gesture, so an iframe mounted with autoplay=1 on page load either
//     silently refuses or plays muted. Mounting the iframe *in response to
//     the click* means the click itself is the gesture, so playback starts
//     with audio, which is what "clear audio" requires.
//  2. It avoids loading YouTube's player (and its cookies) for every video
//     on the page before anyone asks to watch one.
//
// youtube-nocookie.com is the privacy-enhanced host — see lib/learning/
// youtube.ts. `allow` lists exactly the capabilities the player needs;
// omitting "autoplay" from it would block the very playback the click just
// authorised.
export function InlineVideoPlayer({ videoId, title }: InlineVideoPlayerProps) {
  const [playing, setPlaying] = useState(false);

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        aria-label={title ? `נגן: ${title}` : "נגן את הסרטון"}
        className="focus-ring group relative block w-full overflow-hidden rounded-xl border border-hairline-card bg-surface-sunken"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={youtubeThumbnailUrl(videoId)}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-[rgba(10,10,12,0.25)] transition-colors group-hover:bg-[rgba(10,10,12,0.15)]">
          <span className="glass-control flex size-16 items-center justify-center rounded-full">
            <Play size={24} className="ms-1 fill-current text-foreground" aria-hidden />
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="aspect-video w-full overflow-hidden rounded-xl border border-hairline-card bg-black">
      <iframe
        // autoplay=1 is honoured here specifically because this iframe is
        // created by the click above, so the gesture requirement is met.
        src={`${youtubeEmbedUrl(videoId)}?autoplay=1&rel=0&modestbranding=1`}
        title={title ?? "נגן וידאו"}
        className="size-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  );
}
