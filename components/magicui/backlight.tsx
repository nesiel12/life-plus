"use client";

// Adapted from MagicUI's backlight (magicui.design) — hand-integrated, same
// approach as hero-video-dialog, light-rays and the rest of the Option-B
// components.
//
// `pnpm dlx shadcn@latest add @magicui/backlight` cannot run here for three
// separate reasons, each sufficient on its own: pnpm is not installed, there
// is no components.json (so the CLI would run `shadcn init` and rewrite
// globals.css over the Luxe token layer), and every other MagicUI component
// in this folder was vendored by hand for exactly that reason. The registry
// item was fetched from https://magicui.design/r/backlight.json and adapted;
// it declares no dependencies, so nothing was installed.
//
// Changes from upstream, all deliberate:
//  - "use client": upstream omits it, but useId is a hook and this would
//    otherwise fail the moment it is used from a server component.
//  - The filter id is stripped to [A-Za-z0-9_-]. React 19 emits ids like
//    «R0»; Chromium does accept those raw inside url(#…) — measured, not
//    assumed — but nothing about that is guaranteed across engines, and a
//    filter reference that fails to resolve degrades silently to no effect.
//  - children is ReactNode rather than ReactElement. The wrapper renders its
//    children into a plain div, so the narrower type buys nothing and refuses
//    legitimate fragments.
//  - `saturate` is a prop rather than a hard-coded 4. At 4 the glow is a
//    caricature of anything that is not already vivid.
//  - The glow layer carries .backlight-glow, which globals.css disables under
//    prefers-reduced-transparency.
//  - aria-hidden on the SVG holder plus focusable="false": an empty inline
//    SVG is still reachable by some screen readers in browse mode.

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BacklightProps {
  children?: ReactNode;
  className?: string;
  /** Glow spread, in pixels. */
  blur?: number;
  /** How much more saturated the glow is than the source. 1 = unchanged. */
  saturate?: number;
}

/**
 * Wraps content in a saturated glow of itself.
 *
 * A note on where to put this: the filter re-runs on every painted frame of
 * its subtree, so wrapping a *playing* video (or an iframe containing one)
 * means a full-size Gaussian blur per frame. Wrap a still — a poster image,
 * a thumbnail — and let the live player sit above it.
 */
export function Backlight({ blur = 20, saturate = 2.6, children, className }: BacklightProps) {
  const id = `backlight-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div className={cn("relative", className)}>
      <svg width="0" height="0" aria-hidden="true" focusable="false" className="absolute">
        <filter id={id} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blurred" />
          <feColorMatrix type="saturate" in="blurred" values={String(saturate)} />
          <feComposite in="SourceGraphic" operator="over" />
        </filter>
      </svg>

      <div className="backlight-glow" style={{ filter: `url(#${id})` }}>
        {children}
      </div>
    </div>
  );
}
