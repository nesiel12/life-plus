import confetti from "canvas-confetti";
import type { Celebration } from "@/lib/learning/xp";

// The celebration effects, sized to the moment (see celebrationFor in
// lib/learning/xp.ts). Every call goes through canvas-confetti's
// disableForReducedMotion, so someone who has asked their system for less
// motion gets none of it — and nothing here ever fires on page load, only in
// response to something the person just did.

const GOLD = ["#b89355", "#e6d3a4", "#f5d98b", "#876628"];
const LAB = ["#6c5ce7", "#00b894", "#fdcb6e", "#ff7675", "#74b9ff"];

interface Origin {
  /** Viewport pixels. */
  x: number;
  y: number;
}

function fractional(origin: Origin | undefined) {
  if (!origin || typeof window === "undefined") return { x: 0.5, y: 0.6 };
  return { x: origin.x / window.innerWidth, y: origin.y / window.innerHeight };
}

const base = { disableForReducedMotion: true, zIndex: 160, ticks: 140 } as const;

export function fireCelebration(kind: Celebration, origin?: Origin): void {
  if (kind === "none") return;
  const at = fractional(origin);

  if (kind === "milestone") {
    void confetti({ ...base, particleCount: 36, spread: 60, startVelocity: 28, origin: at, colors: LAB, scalar: 0.9 });
    return;
  }

  if (kind === "topic") {
    // Fireworks: three bursts, staggered, from a little above where it happened.
    const top = { x: at.x, y: Math.max(0.2, at.y - 0.15) };
    void confetti({ ...base, particleCount: 90, spread: 90, startVelocity: 42, origin: top, colors: LAB });
    setTimeout(() => void confetti({ ...base, particleCount: 60, spread: 120, angle: 60, origin: { x: 0.1, y: 0.7 }, colors: GOLD }), 180);
    setTimeout(() => void confetti({ ...base, particleCount: 60, spread: 120, angle: 120, origin: { x: 0.9, y: 0.7 }, colors: GOLD }), 320);
    return;
  }

  // A new level: the biggest moment there is.
  void confetti({ ...base, particleCount: 160, spread: 110, startVelocity: 55, origin: { x: 0.5, y: 0.55 }, colors: GOLD, scalar: 1.2 });
  setTimeout(() => void confetti({ ...base, particleCount: 100, spread: 160, startVelocity: 35, origin: { x: 0.5, y: 0.3 }, colors: [...GOLD, ...LAB] }), 250);
}
