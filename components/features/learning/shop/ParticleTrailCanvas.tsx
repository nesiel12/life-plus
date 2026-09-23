"use client";

import { useEffect, useRef } from "react";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface TrailSpec {
  colors: string[];
  spawnPerMove: number;
  gravity: number;
  fade: "linear" | "spark";
}

const TRAILS: Record<string, TrailSpec> = {
  trail_fire: { colors: ["#ff7a1a", "#ffb84d", "#ff3d00"], spawnPerMove: 2, gravity: -0.02, fade: "linear" },
  trail_gold_dust: { colors: ["#e6c988", "#f5e2b0", "#b89355"], spawnPerMove: 1, gravity: 0.01, fade: "linear" },
  trail_neon_sparkles: { colors: ["#00e5ff", "#ff00e5", "#d4ff3d"], spawnPerMove: 2, gravity: 0, fade: "spark" },
  trail_starfall: { colors: ["#ffffff", "#c9b8ff", "#8ea6ff"], spawnPerMove: 1, gravity: 0.03, fade: "spark" },
};

interface ParticleTrailCanvasProps {
  /** null/undefined = no trail equipped, renders nothing. */
  activeTrailId: string | null | undefined;
}

/**
 * A cursor-following particle trail — one of the XP Shop's purchasable
 * cosmetics (lib/learning/xpShop.ts's trail_* items). Deliberately mounted
 * only inside the Learning module's own tree (LearningHub.tsx), not the
 * root layout: an always-on cursor effect competing with every other
 * module's own visual language is a bigger blast radius than a cosmetic
 * reward needs, and this is where XP/gamification already lives.
 *
 * A plain <canvas>, not framer-motion or DOM nodes per particle — a trail
 * can spawn dozens of short-lived particles a second, and animating that
 * many separate elements is exactly the kind of thing a single canvas
 * redraw loop is for.
 */
export function ParticleTrailCanvas({ activeTrailId }: ParticleTrailCanvasProps) {
  const reduce = useLabReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const spec = activeTrailId ? TRAILS[activeTrailId] : undefined;

  useEffect(() => {
    if (!spec || reduce) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    function onPointerMove(e: PointerEvent) {
      pointerRef.current = { x: e.clientX, y: e.clientY };
      if (!spec) return;
      for (let i = 0; i < spec.spawnPerMove; i++) {
        particlesRef.current.push({
          x: e.clientX + (Math.random() - 0.5) * 6,
          y: e.clientY + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          life: 0,
          maxLife: 28 + Math.random() * 20,
          size: 1.5 + Math.random() * 2.5,
          color: spec.colors[Math.floor(Math.random() * spec.colors.length)],
        });
      }
      // A dense trail is still a trail, not a screen full of dust —
      // bounded so a long, fast swipe can't grow this unbounded.
      if (particlesRef.current.length > 400) particlesRef.current.splice(0, particlesRef.current.length - 400);
    }
    window.addEventListener("pointermove", onPointerMove);

    let frame = 0;
    function tick() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const alive: Particle[] = [];
      for (const p of particlesRef.current) {
        p.life += 1;
        if (p.life >= p.maxLife) continue;
        p.x += p.vx;
        p.y += p.vy + (spec?.gravity ?? 0) * p.life;
        const t = p.life / p.maxLife;
        const alpha = spec?.fade === "spark" ? Math.sin((1 - t) * Math.PI) : 1 - t;
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
        ctx.fill();
        alive.push(p);
      }
      ctx.globalAlpha = 1;
      particlesRef.current = alive;
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      cancelAnimationFrame(frame);
      particlesRef.current = [];
    };
  }, [spec, reduce]);

  if (!spec || reduce) return null;

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-[200]" />;
}
