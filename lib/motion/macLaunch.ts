// The macOS-style "application launch" transition, as one reusable spec.
//
// The brief, verbatim in spirit: a window appears as if expanding from its
// launch point — it starts slightly smaller (94–96%) and subtly transparent,
// then scales to 100% while fading in, on a fast premium ease-out with a
// slight natural settle. Never bouncy, never slow, ~250–350ms, and it must
// not affect layout or make content reflow.
//
// How each requirement is met:
//   • Only `opacity` and `transform: scale` animate. Both are compositor-only
//     properties, so no layout is computed during the animation and nothing
//     around the element moves.
//   • Opacity runs on a tween (a fade has nothing to "settle").
//   • Scale runs on a spring with a very low bounce: it arrives with the soft
//     deceleration of a real mass coming to rest — the "natural settle" —
//     while the overshoot stays in the fraction-of-a-percent range no eye
//     reads as a bounce.
//   • Exit is shorter than entry, the way macOS closes faster than it opens.
//
// Consumed by the shared <Modal> (so every modal in the app launches this
// way), the notifications panel, the app shell's first paint, and — through
// the CSS twin in app/globals.css (`.animate-mac-launch`) — anything that is
// not a framer-motion element.

import type { Transition, Variants } from "framer-motion";

export const MAC_LAUNCH = {
  /** Start scale — inside the 94–96% band of the spec. */
  fromScale: 0.95,
  /** Entry length, in the 250–350ms band. */
  durationMs: 300,
  /**
   * A fast ease-out (easeOutQuint-like): most of the motion happens in the
   * first third, then it glides in. Both y control points are 1, so the tween
   * can never exceed its target.
   */
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  /** Spring bounce for the scale. 0 is critically damped; this is barely above. */
  bounce: 0.06,
  /** Exit: shorter, and only down to 97% — a close should feel lighter than an open. */
  exitScale: 0.97,
  exitDurationMs: 180,
  exitEase: [0.4, 0, 1, 1] as [number, number, number, number],
} as const;

/** The entry transition: tweened opacity, softly-settling spring on scale. */
export const macLaunchTransition: Transition = {
  opacity: { duration: MAC_LAUNCH.durationMs / 1000, ease: MAC_LAUNCH.ease },
  scale: { type: "spring", visualDuration: MAC_LAUNCH.durationMs / 1000, bounce: MAC_LAUNCH.bounce },
};

export const macExitTransition: Transition = {
  duration: MAC_LAUNCH.exitDurationMs / 1000,
  ease: MAC_LAUNCH.exitEase,
};

/**
 * Variants for `initial="hidden" animate="visible" exit="exit"`.
 *
 * With reduced motion the scale is dropped entirely — a fade is the one
 * transition that carries no vestibular cost — and it gets quicker.
 */
export function macLaunchVariants(reducedMotion = false): Variants {
  if (reducedMotion) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1, transition: { duration: 0.15, ease: "linear" } },
      exit: { opacity: 0, transition: { duration: 0.12, ease: "linear" } },
    };
  }
  return {
    hidden: { opacity: 0, scale: MAC_LAUNCH.fromScale },
    visible: { opacity: 1, scale: 1, transition: macLaunchTransition },
    exit: { opacity: 0, scale: MAC_LAUNCH.exitScale, transition: macExitTransition },
  };
}

/** The backdrop behind a launched window fades on the same clock. */
export function macBackdropVariants(reducedMotion = false): Variants {
  const enter = reducedMotion ? 0.15 : MAC_LAUNCH.durationMs / 1000;
  return {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: enter, ease: "easeOut" } },
    exit: { opacity: 0, transition: { duration: MAC_LAUNCH.exitDurationMs / 1000, ease: "easeIn" } },
  };
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The transform-origin that makes a centered panel appear to grow out of the
 * control that launched it — the notification bell, say — as a macOS window
 * grows out of its Dock icon.
 *
 * The panel is centered in the viewport, so its box is known from its size
 * alone; the origin is the launcher's center expressed in the panel's own
 * coordinates. Clamped to a band around the panel: a launcher far off to one
 * side should *suggest* the direction, not make the panel swing in from
 * across the screen.
 */
export function launchOrigin(
  launcher: Rect,
  panel: { width: number; height: number },
  viewport: { width: number; height: number }
): string {
  const panelLeft = (viewport.width - panel.width) / 2;
  const panelTop = (viewport.height - panel.height) / 2;
  const cx = launcher.left + launcher.width / 2 - panelLeft;
  const cy = launcher.top + launcher.height / 2 - panelTop;
  const clamp = (value: number, size: number) => Math.round(Math.min(size * 1.25, Math.max(size * -0.25, value)));
  return `${clamp(cx, panel.width)}px ${clamp(cy, panel.height)}px`;
}
