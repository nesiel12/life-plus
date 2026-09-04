"use client";

import { ExternalLink } from "lucide-react";
import { HeroVideoDialog } from "@/components/magicui/hero-video-dialog";
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId } from "@/lib/learning/youtube";

interface ResourceLauncherProps {
  url: string;
  title: string;
}

/** Hostname only — a raw URL in a list row is noise, and a long one wrecks
 *  the layout. Falls back to the raw string if it won't parse. */
function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Opens a learning resource in place.
//
// YouTube plays natively inside the app through HeroVideoDialog — no tab
// switch, which is the whole point of an in-app course hub.
//
// Everything else opens in a new tab, deliberately. Embedding an arbitrary
// third-party page in an iframe mostly does not work: most sites send
// X-Frame-Options: DENY or a frame-ancestors CSP, and the user would get a
// silent blank box instead of their course. An honest external link beats a
// broken embed, so non-video resources get a real affordance saying where
// they lead rather than a pretend in-app frame.
export function ResourceLauncher({ url, title }: ResourceLauncherProps) {
  const videoId = youtubeVideoId(url);

  if (videoId) {
    return (
      <div className="mt-2 max-w-xs">
        <HeroVideoDialog
          videoSrc={youtubeEmbedUrl(videoId)}
          thumbnailSrc={youtubeThumbnailUrl(videoId)}
          thumbnailAlt={title}
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="focus-ring mt-1.5 flex w-fit items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-fill-subtle"
    >
      <ExternalLink size={11} className="text-accent-learning" aria-hidden />
      <span className="ltr">{hostLabel(url)}</span>
      <span className="sr-only">(נפתח בלשונית חדשה)</span>
    </a>
  );
}
