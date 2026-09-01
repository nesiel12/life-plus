"use client";

// Native tilt card. The requested `@unlumen-ui/tilt-card` isn't published to
// npm and its namespaced shadcn registry would require `shadcn init` (which
// would rewrite globals.css and blow away the Luxe token layer), so this is a
// hand-built equivalent with the same behaviour: 3D pointer-tracking tilt plus
// a moving specular highlight, collapsing to a static card under
// prefers-reduced-motion.

import { useRef, type ReactNode } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "@/lib/utils";

interface TiltCardProps {
  children: ReactNode;
  /** Applied to the outer element — grid spans and surface chrome go here. */
  className?: string;
  /** Max tilt in degrees. */
  intensity?: number;
  /** Turn the 3D effect off entirely (falls back to a plain div). */
  disabled?: boolean;
}

export function TiltCard({ children, className, intensity = 7, disabled = false }: TiltCardProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  // A 3D transform makes text inside a focused input render blurry in
  // Chrome, so the tilt stands down while anything in the card has focus.
  // A ref, not state: `style` must keep pointing at the same motion values on
  // every render or framer-motion stops driving the transform.
  const editing = useRef(false);

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [intensity, -intensity]), {
    stiffness: 180,
    damping: 22,
  });
  const ry = useSpring(useTransform(px, [0, 1], [-intensity, intensity]), {
    stiffness: 180,
    damping: 22,
  });
  const glareX = useTransform(px, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(py, [0, 1], ["0%", "100%"]);
  const glare = useMotionTemplate`radial-gradient(320px circle at ${glareX} ${glareY}, color-mix(in srgb, var(--gold) 16%, transparent), transparent 65%)`;

  function onMove(e: React.PointerEvent) {
    if (editing.current) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  }
  function reset() {
    px.set(0.5);
    py.set(0.5);
  }

  if (reduce || disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onFocusCapture={() => {
        editing.current = true;
        reset();
      }}
      onBlurCapture={() => {
        editing.current = false;
      }}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 1100 }}
      className={cn("group/tilt relative [transform-style:preserve-3d]", className)}
    >
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/tilt:opacity-100"
        style={{ background: glare }}
      />
    </motion.div>
  );
}
