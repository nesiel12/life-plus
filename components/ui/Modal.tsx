"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Single stacking-order scale for every overlay in the app, instead of each
// component picking its own z-index independently (see docs/TECH_DEBT.md #12).
// Ordered by "how much should this block everything else": the AI panel can
// coexist with page content, Quick Capture sits above it, onboarding is
// mandatory and sits above both.
export const Z_INDEX = {
  panel: "z-50",
  modal: "z-[60]",
  onboarding: "z-[70]",
} as const;

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** Full-screen dimmed backdrop behind a centered panel (QuickCapture,
   * OnboardingFlow). false = an undimmed, freely-positioned panel with no
   * backdrop (AICompanion). */
  backdrop?: boolean;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  zIndex?: string;
  panelClassName?: string;
  backdropClassName?: string;
}

export function Modal({
  open,
  onClose,
  children,
  backdrop = true,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  zIndex = Z_INDEX.modal,
  panelClassName,
  backdropClassName,
}: ModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape || !onClose) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, closeOnEscape, onClose]);

  if (!backdrop) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn("glass-card fixed rounded-2xl shadow-2xl", zIndex, panelClassName)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 flex items-start justify-center bg-black/50 px-6 pt-32 backdrop-blur-sm",
            zIndex,
            backdropClassName
          )}
          onClick={closeOnBackdropClick ? onClose : undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn("glass-card w-full rounded-2xl shadow-2xl", panelClassName)}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
