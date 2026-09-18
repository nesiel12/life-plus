"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

// Leather tones for the placeholder spine, picked by title so the same sefer
// always gets the same colour and a shelf of placeholders does not look like
// one book repeated.
const LEATHERS: [string, string][] = [
  ["#5a2a2f", "#2a1215"], // burgundy
  ["#223a5e", "#0f1b2e"], // navy
  ["#23473a", "#0e2119"], // forest
  ["#4a3520", "#22170c"], // tan leather
  ["#3d3552", "#1b1626"], // plum
  ["#2f3a3f", "#141a1d"], // slate
];

function leatherFor(title: string): [string, string] {
  let hash = 0;
  for (const char of title) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LEATHERS[hash % LEATHERS.length];
}

const SIZES = {
  sm: { box: "h-16 w-12", text: "text-[0.55rem]", px: [48, 64] },
  md: { box: "h-36 w-26", text: "text-xs", px: [104, 144] },
  lg: { box: "h-48 w-34", text: "text-sm", px: [136, 192] },
  xl: { box: "h-60 w-42 sm:h-64 sm:w-44", text: "text-base", px: [176, 256] },
} as const;

interface SeferCoverProps {
  title: string;
  coverUrl?: string;
  size?: keyof typeof SIZES;
  className?: string;
  /** A short line under the title on the placeholder (the author). */
  caption?: string;
}

/**
 * A book cover: the real cover art when a provider supplied one, otherwise a
 * designed leather-and-gold spine with the Hebrew title set on it.
 *
 * The placeholder is deliberate design, not an apology. Most seforim have no
 * cover in Google Books, and a grid of grey boxes would make the bookshelf
 * look broken; a shelf of bound volumes looks like a beit midrash.
 */
export function SeferCover({ title, coverUrl, size = "md", className, caption }: SeferCoverProps) {
  const config = SIZES[size];

  if (coverUrl) {
    return (
      <Image
        src={coverUrl}
        alt={`כריכת ${title}`}
        width={config.px[0]}
        height={config.px[1]}
        className={cn(
          config.box,
          "shrink-0 rounded-lg object-cover shadow-[0_14px_30px_-16px_rgba(0,0,0,0.55)] ring-1 ring-hairline-card",
          className
        )}
        unoptimized
      />
    );
  }

  const [from, to] = leatherFor(title);
  return (
    <div
      role="img"
      aria-label={`כריכה של ${title}`}
      style={{ "--spine-from": from, "--spine-to": to } as React.CSSProperties}
      className={cn(
        config.box,
        "sefer-spine relative flex shrink-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-lg px-2 text-center",
        className
      )}
    >
      <span className={cn("line-clamp-3 font-medium leading-snug [text-wrap:balance]", config.text)}>{title}</span>
      {caption && size !== "sm" && (
        <span className="line-clamp-1 text-[0.6rem] text-[#d8c39a]/80">{caption}</span>
      )}
    </div>
  );
}
