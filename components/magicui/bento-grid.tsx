"use client";

// Adapted from MagicUI's Bento Grid (magicui.design) — Option B. Rebuilt for
// the LIFE PLUS token system: no @radix-ui/react-icons, no shadcn <Button>,
// RTL-safe, and BentoCard takes free children (our own cards go inside the
// cells) with an optional cta footer link.
//
// Two behaviours layered on top of the original: the grid drives a
// stagger-fade entry through framer-motion variants, and each cell is a
// TiltCard so the surfaces shift in 3D under the pointer.

import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { TiltCard } from "@/components/ui/TiltCard";
import { cn } from "@/lib/utils";

const GRID_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.075, delayChildren: 0.12 } },
};

const CELL_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 22, scale: 0.985 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

// The shared card surface: a hairline edge (a dark line at low opacity, not a
// grey box), a soft diffuse lift, and generous internal padding.
const CARD_SURFACE = cn(
  "group/card relative flex h-full flex-col overflow-hidden rounded-2xl",
  "border border-hairline-card bg-surface p-6 sm:p-7",
  "shadow-[0_1px_2px_rgba(16,16,20,0.03),0_18px_44px_-28px_rgba(16,16,20,0.22)]"
);

interface BentoGridProps {
  children: ReactNode;
  className?: string;
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <motion.div
      variants={GRID_VARIANTS}
      initial="hidden"
      animate="show"
      // Tight, deliberately: the dashboard reads as one panel of grouped
      // widgets, not a scatter of distant cards. Just enough of a seam
      // (0.75rem, a touch more at width) to keep each card's own border and
      // shadow legible.
      className={cn(
        "grid w-full grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4 2xl:grid-cols-4",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

interface BentoCardProps {
  children: ReactNode;
  /** Ambient visual behind the content (a gradient, LightRays, a chart). */
  background?: ReactNode;
  /** Optional footer link revealed on hover. */
  href?: string;
  cta?: string;
  /** 3D pointer tilt. Off for dense form panels. */
  tilt?: boolean;
  /** Grid spans live here — applied to the cell, not the surface. */
  className?: string;
}

export function BentoCard({
  children,
  background,
  href,
  cta,
  tilt = true,
  className,
}: BentoCardProps) {
  return (
    // min-w-0 lets long Hebrew strings wrap instead of forcing the track wider
    // (the usual cause of squeezed / overlapping bento columns).
    <motion.div variants={CELL_VARIANTS} className={cn("min-w-0", className)}>
      <TiltCard disabled={!tilt} className={CARD_SURFACE}>
        {background && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            {background}
          </div>
        )}
        <div className="relative z-10 flex min-h-0 w-full min-w-0 flex-1 flex-col">{children}</div>
        {href && cta && (
          <a
            href={href}
            className="focus-ring relative z-10 mt-5 inline-flex items-center gap-1 self-start rounded-lg text-xs font-medium text-gold-ink opacity-0 transition-opacity duration-300 group-hover/card:opacity-100 focus-visible:opacity-100"
          >
            {cta}
            <ArrowLeft size={12} aria-hidden />
          </a>
        )}
      </TiltCard>
    </motion.div>
  );
}
