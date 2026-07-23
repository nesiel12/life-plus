"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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

  const panelRef = useRef<HTMLDivElement>(null);

  // WCAG modal-dialog focus management (docs/BACKLOG.md): move focus into
  // the panel on open (unless something inside it — e.g. an autoFocus field
  // — already claimed it), trap Tab within the panel while open, and return
  // focus to whatever had it before the modal opened (typically the button
  // that triggered it) once it closes.
  useEffect(() => {
    if (!open) return;

    const triggerElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable ?? panel).focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    function handleTab(e: KeyboardEvent) {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", handleTab);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", handleTab);
      triggerElement?.focus();
    };
  }, [open]);

  if (!backdrop) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={cn(
              "focus-ring glass-panel glass-glow fixed rounded-2xl",
              zIndex,
              panelClassName
            )}
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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={{ opacity: 0, y: -16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className={cn("focus-ring glass-panel glass-glow w-full rounded-2xl", panelClassName)}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
