"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { macBackdropVariants, macLaunchVariants } from "@/lib/motion/macLaunch";
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
  welcome: "z-[80]",
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
  /** Where a backdropped panel sits: near the top (the default), or dead center. */
  align?: "top" | "center";
  /**
   * CSS transform-origin for the launch animation — see launchOrigin() in
   * lib/motion/macLaunch.ts, which makes a panel grow out of its launcher.
   */
  origin?: string;
  /** Accessible name for the dialog. */
  label?: string;
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
  align = "top",
  origin,
  label,
}: ModalProps) {
  const reduceMotion = Boolean(useReducedMotion());
  const panelVariants = macLaunchVariants(reduceMotion);

  // Portalled to <body>. A `position: fixed` element is only fixed to the
  // viewport when no ancestor has a transform, filter or backdrop-filter —
  // and the glass sidebar has all three, which is exactly how the
  // notifications panel ended up clipped to a sliver of the screen. Rendering
  // at the root makes every modal immune to where its trigger happens to live.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  if (!mounted) return null;

  if (!backdrop) {
    return createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            aria-label={label}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: origin }}
            className={cn(
              "focus-ring glass-panel glass-glow fixed rounded-2xl will-change-transform",
              zIndex,
              panelClassName
            )}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          variants={macBackdropVariants(reduceMotion)}
          initial="hidden"
          animate="visible"
          exit="exit"
          className={cn(
            "fixed inset-0 flex justify-center bg-black/50 backdrop-blur-sm",
            align === "center" ? "items-center p-4 sm:p-6" : "items-start px-6 pt-32",
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
            aria-label={label}
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ transformOrigin: origin }}
            className={cn("focus-ring glass-panel glass-glow w-full rounded-2xl will-change-transform", panelClassName)}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
