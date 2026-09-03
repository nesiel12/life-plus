"use client";

// Adapted from MagicUI's hero-video-dialog (magicui.design) — hand-integrated,
// same approach as kinetic-text and the rest of the Option-B components.
// `shadcn add @magicui/hero-video-dialog` can't run here: there is no
// components.json, so it would trigger `shadcn init` and rewrite globals.css
// over the Luxe token layer.
//
// Changes from upstream, all deliberate:
//  - motion/react -> framer-motion (this repo's animation dependency).
//  - Luxe surface instead of the glass treatment: an opaque scrim and a
//    hairline/gold frame rather than backdrop-blur and a 2px white border.
//  - RTL-safe positioning (end-0, not right-0).
//  - Upstream's close button renders but has no onClick — it only "works"
//    because the click bubbles to the backdrop. Wired up properly here, and
//    given an accessible label.
//  - Escape closes the dialog, and focus is restored to the trigger. Upstream
//    has an onKeyDown on a div that never receives focus, so Escape does
//    nothing there.
//  - prefers-reduced-motion collapses the open/close transition to a fade.

import { useCallback, useEffect, useRef, useState } from "react";
import { Play, XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type AnimationStyle = "from-bottom" | "from-center" | "from-top" | "fade";

interface HeroVideoDialogProps {
  animationStyle?: AnimationStyle;
  /** Embed URL, e.g. https://www.youtube.com/embed/<id> */
  videoSrc: string;
  thumbnailSrc: string;
  thumbnailAlt?: string;
  className?: string;
}

// Derived from MotionProps rather than hand-declared: spreading a
// independently-shaped object into motion.div widens each field to `object`
// and stops matching what motion.div actually accepts. Picking from the
// consumer's own prop type makes the two impossible to drift apart.
type DialogAnimation = Required<Pick<MotionProps, "initial" | "animate" | "exit">>;

const ANIMATION_VARIANTS: Record<AnimationStyle, DialogAnimation> = {
  "from-bottom": {
    initial: { y: "100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
  },
  "from-center": {
    initial: { scale: 0.9, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: { scale: 0.9, opacity: 0 },
  },
  "from-top": {
    initial: { y: "-100%", opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit: { y: "-100%", opacity: 0 },
  },
  fade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } },
};

export function HeroVideoDialog({
  animationStyle = "from-center",
  videoSrc,
  thumbnailSrc,
  thumbnailAlt = "תמונה ממוזערת של הסרטון",
  className,
}: HeroVideoDialogProps) {
  const reduce = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const variants = ANIMATION_VARIANTS[reduce ? "fade" : animationStyle];

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    // The dialog covers the page; stop the body scrolling behind it.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, close]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="נגן את הסרטון"
        onClick={() => setIsOpen(true)}
        className="focus-ring group relative block w-full cursor-pointer overflow-hidden rounded-xl border border-hairline-card bg-surface-sunken p-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailSrc}
          alt={thumbnailAlt}
          loading="lazy"
          className="aspect-video w-full object-cover transition-all duration-300 ease-out group-hover:scale-[1.02] group-hover:brightness-[0.85]"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-[var(--ink)]/85 shadow-[0_8px_24px_-8px_rgba(16,16,20,0.6)] transition-transform duration-300 ease-out group-hover:scale-110">
            <Play size={22} className="ms-0.5 fill-[var(--background)] text-[var(--background)]" aria-hidden />
          </span>
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(10,10,12,0.88)] px-4"
          >
            <motion.div
              {...variants}
              transition={reduce ? { duration: 0.15 } : { type: "spring", damping: 30, stiffness: 300 }}
              role="dialog"
              aria-modal="true"
              aria-label="נגן וידאו"
              // The frame is a click target inside the backdrop; stop the
              // click closing the dialog when the user aims for the player.
              onClick={(e) => e.stopPropagation()}
              className="relative mx-auto aspect-video w-full max-w-4xl"
            >
              <button
                type="button"
                onClick={close}
                aria-label="סגור את הסרטון"
                className="focus-ring absolute -top-12 end-0 grid size-9 place-items-center rounded-full border border-hairline-card bg-surface text-foreground transition-opacity hover:opacity-80"
              >
                <XIcon size={16} aria-hidden />
              </button>
              <div className="relative size-full overflow-hidden rounded-2xl border border-gold-line bg-black">
                <iframe
                  src={videoSrc}
                  title="נגן וידאו"
                  className="size-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
