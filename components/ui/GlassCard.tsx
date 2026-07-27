"use client";

import { motion } from "framer-motion";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Makes the whole card a keyboard-accessible clickable surface (e.g. a
   * Rabbi card opening its profile) instead of relying on an inner button —
   * optional, existing callers with no onClick are unaffected. */
  onClick?: () => void;
}

export function GlassCard({ children, className, delay = 0, onClick }: GlassCardProps) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      onClick={onClick}
      onKeyDown={onClick ? handleKeyDown : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={cn("glass-card rounded-2xl p-6", onClick && "focus-ring cursor-pointer transition-transform hover:scale-[1.01]", className)}
    >
      {children}
    </motion.div>
  );
}
