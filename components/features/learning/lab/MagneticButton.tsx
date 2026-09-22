"use client";

import { useRef, useState, type ButtonHTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { cn } from "@/lib/utils";

interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface MagneticButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onDrag" | "onDragStart" | "onDragEnd" | "onAnimationStart"> {
  children: ReactNode;
  /** How far toward the cursor the button leans, as a fraction of the offset. */
  strength?: number;
}

/** The most a button will lean, in px, however far away the cursor is. */
const MAX_PULL = 10;

/**
 * A button that leans toward the cursor and sends a ripple out from a click.
 *
 * Both effects are transforms and opacity — the pull is a spring on x/y, the
 * ripple a scaled, fading circle — so neither touches layout. With reduced
 * motion, or on a device with no hover, it is an ordinary button.
 */
export function MagneticButton({ children, className, strength = 0.28, onPointerDown, onPointerMove, onPointerLeave, disabled, ...rest }: MagneticButtonProps) {
  const reduce = useLabReducedMotion();
  const ref = useRef<HTMLButtonElement>(null);
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.6 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18, mass: 0.6 });
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const nextId = useRef(0);

  function pull(e: PointerEvent<HTMLButtonElement>) {
    onPointerMove?.(e);
    if (reduce || disabled || e.pointerType === "touch") return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    x.set(Math.max(-MAX_PULL, Math.min(MAX_PULL, dx * strength)));
    y.set(Math.max(-MAX_PULL, Math.min(MAX_PULL, dy * strength)));
  }

  function release(e: PointerEvent<HTMLButtonElement>) {
    onPointerLeave?.(e);
    x.set(0);
    y.set(0);
  }

  function ripple(e: PointerEvent<HTMLButtonElement>) {
    onPointerDown?.(e);
    if (reduce || disabled) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setRipples((r) => [...r, { id: nextId.current++, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
  }

  return (
    <motion.button
      ref={ref}
      type="button"
      disabled={disabled}
      style={reduce ? undefined : { x, y }}
      whileTap={reduce || disabled ? undefined : { scale: 0.95 }}
      onPointerMove={pull}
      onPointerLeave={release}
      onPointerDown={ripple}
      className={cn("focus-ring relative isolate overflow-hidden", className)}
      {...rest}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden
          className="pointer-events-none absolute -z-10 size-16 rounded-full bg-current"
          style={{ left: r.x - 32, top: r.y - 32 }}
          initial={{ scale: 0, opacity: 0.35 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 0.65, ease: "easeOut" }}
          onAnimationComplete={() => setRipples((list) => list.filter((item) => item.id !== r.id))}
        />
      ))}
      {children}
    </motion.button>
  );
}
