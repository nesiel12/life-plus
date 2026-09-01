"use client";

import { useState } from "react";

// The mark's path is resolved at build time by next.config.ts, which looks for
// public/life-plus-mark.{png,webp,jpg} and falls back to the gold SVG
// placeholder. Drop the real high-end artwork in at public/life-plus-mark.png,
// restart the dev server, and this picks it up with no code change.
const FALLBACK_SRC = "/life-plus-mark.svg";
const MARK_SRC = process.env.NEXT_PUBLIC_LOGO_MARK || FALLBACK_SRC;

interface LogoProps {
  /** Rendered height in px. Width follows the artwork's aspect ratio. */
  size?: number;
  className?: string;
}

// A plain <img> rather than next/image on purpose: next/image can't recover
// from a missing source, and this component's contract is "use the real
// artwork when it exists, degrade quietly when it doesn't" — the onError below
// is the safety net for a file deleted after the build.
//
// `size` sets the height and the width follows the artwork's own aspect ratio.
// The mark ships with a real alpha channel, so it needs no blend mode, mask or
// frame to sit on either theme — it is drawn exactly as it is on disk.
export function Logo({ size = 32, className }: LogoProps) {
  const [src, setSrc] = useState(MARK_SRC);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      height={size}
      onError={() => setSrc(FALLBACK_SRC)}
      className={className}
      // maxWidth guards against a narrow rail (the collapsed sidebar);
      // object-fit then scales the content inside that box, so the constraint
      // letterboxes instead of squashing.
      style={{ height: size, width: "auto", maxWidth: "100%", objectFit: "contain" }}
      aria-hidden
    />
  );
}

// The wordmark, set the way the logo has it: wide-tracked, uppercase, gold.
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      dir="ltr"
      className={`text-gold-gradient font-semibold uppercase leading-none ${className ?? ""}`}
      style={{ letterSpacing: "0.22em" }}
    >
      LIFE&nbsp;PLUS
    </span>
  );
}
