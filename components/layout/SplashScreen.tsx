"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/constants";

const SESSION_KEY = "lifeplus.splash.seen";
const HOLD_MS = 2100;

// The opening view: the LIFE PLUS mark + wordmark, large and centered on a
// clean field, with a calm gold entrance. Shown once per browser session
// (sessionStorage); tap or any key skips it. Honors prefers-reduced-motion —
// a brief static hold and a plain fade, nothing else.
//
// <Logo> resolves the artwork itself (public/life-plus-mark.png, falling back
// to the gold SVG) — this shell never needs to change when the final file
// lands.
export function SplashScreen() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // storage blocked (private mode) — show once, don't persist
    }
    if (seen) return;

    setVisible(true);
    const dismiss = () => {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      setVisible(false);
    };

    const timer = window.setTimeout(dismiss, HOLD_MS);
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey, { once: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          role="status"
          aria-label={`${APP_NAME} נטען`}
          onClick={() => setVisible(false)}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6 sm:gap-10"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, ease: "easeInOut" } }}
        >
          {/* soft gold bloom behind the mark */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute h-[62vmin] w-[62vmin] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--gold) 24%, transparent), transparent 70%)",
            }}
            initial={reduceMotion ? { opacity: 0.5 } : { opacity: 0, scale: 0.6 }}
            animate={
              reduceMotion ? { opacity: 0.5 } : { opacity: [0, 0.85, 0.5], scale: [0.6, 1.15, 1] }
            }
            transition={{ duration: 1.7, ease: "easeOut" }}
          />

          <motion.div
            initial={
              reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.82, filter: "blur(6px)" }
            }
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 16, mass: 0.9 }
            }
          >
            <Logo size={240} className="max-h-[34vh]" />
          </motion.div>

          {/* No wordmark here — the lockup artwork carries it. Just a rule
              drawing itself under the mark as the hold plays out. */}
          <motion.span
            aria-hidden
            className="block h-px bg-[var(--gold-line)]"
            initial={reduceMotion ? { width: 180 } : { width: 0 }}
            animate={{ width: 180 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.6, delay: 0.5, ease: "easeOut" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
