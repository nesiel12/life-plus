"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Liquid Glass — frosted refraction for the Luxe theme.
//
// Adapted from dashersw/liquid-glass-js, NOT ported. That library renders
// each glass surface with a WebGL 2.0 shader and samples the page behind it
// via html2canvas. Three reasons that approach is wrong for this app,
// specifically:
//
//  1. It contradicts the same directive it arrived in. This is applied to
//     the nav bar, four dashboard bento cards and the AI Companion dialog —
//     that's 6+ live WebGL contexts plus repeated full-page rasterization,
//     on a screen the same directive asks to "render instantly without lag".
//  2. html2canvas re-rasterizes the DOM to sample the backdrop. It does not
//     reliably reproduce backdrop-filter, custom fonts, or cross-origin
//     images — and this dashboard renders Google profile photos from
//     lh3.googleusercontent.com, which would taint the canvas.
//  3. The browser already does this natively. `backdrop-filter` is
//     GPU-composited and samples the real backdrop, including content this
//     component knows nothing about.
//
// So the refraction is real, just not shader-based: an SVG feTurbulence +
// feDisplacementMap warps the backdrop at the edges (where a physical lens
// bends light most), `backdrop-filter` supplies the frost and saturation,
// and layered inset rings supply the rim light and specular highlight.
//
// Readability is a hard constraint, not a setting: Hebrew body text over a
// blurred, moving backdrop is the first thing to fail in a glass UI. The
// content layer therefore sits above an opaque-enough tint floor, and the
// whole effect degrades to the plain Luxe card (`bg-surface` + hairline)
// wherever backdrop-filter is unsupported or the user prefers reduced
// transparency — see globals.css.

export type GlassTone = "neutral" | "gold";

interface LiquidGlassProps {
  children: ReactNode;
  className?: string;
  /** Edge refraction strength in px of displacement. 0 disables the filter. */
  refraction?: number;
  /** Backdrop blur radius in px. */
  blur?: number;
  /** Gold-tinted rim, for surfaces that should read as brand chrome. */
  tone?: GlassTone;
  /** Renders as a <section> etc. instead of a <div> when semantics call for it. */
  as?: "div" | "section" | "aside" | "header";
}

export function LiquidGlass({
  children,
  className,
  refraction = 0,
  blur = 16,
  tone = "neutral",
  as: Tag = "div",
}: LiquidGlassProps) {
  // Filter ids must be unique per instance or every glass surface on the
  // page shares (and fights over) one filter definition.
  const filterId = useId().replace(/:/g, "");

  // Composed as one value rather than layered onto a pseudo-element:
  // backdrop-filter accepts a url() filter reference and applies it to the
  // *backdrop only*, so the displacement can never warp the text above it.
  // (A plain `filter` would, which is the trap this avoids.)
  const backdrop = [refraction > 0 ? `url(#${filterId})` : "", `blur(${blur}px)`, "saturate(1.6)"]
    .filter(Boolean)
    .join(" ");

  const style = { "--glass-backdrop": backdrop } as CSSProperties;

  return (
    <Tag
      data-glass-tone={tone}
      className={cn("liquid-glass", className)}
      style={style}
    >
      {refraction > 0 && (
        <svg aria-hidden className="pointer-events-none absolute size-0" focusable="false">
          <filter id={filterId} x="0%" y="0%" width="100%" height="100%">
            {/* Low-frequency noise displaces the backdrop by a couple of
                pixels — enough to read as a lens edge, not enough to smear
                text behind it into mush. */}
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves={2} seed={7} result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
            <feDisplacementMap
              in="SourceGraphic"
              in2="softNoise"
              scale={refraction}
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </svg>
      )}

      {/* Rim light + specular sheen. Purely decorative, never in the
          accessibility tree, and never intercepting pointer events. */}
      <span aria-hidden className="liquid-glass__sheen" />

      <div className="liquid-glass__content">{children}</div>
    </Tag>
  );
}
