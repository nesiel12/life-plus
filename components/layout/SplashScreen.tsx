"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Logo } from "@/components/ui/Logo";
import { APP_NAME } from "@/lib/constants";

const SESSION_KEY = "lifeplus.splash.seen";
const HOLD_MS = 1900;

// The opening view: the LIFE PLUS mark, large and centered, with a calm
// entrance, shown once per browser session (sessionStorage) before the app
// underneath is revealed. Tapping or pressing a key skips it. Honors
// prefers-reduced-motion — no scale/blur/stagger, just a brief static hold
// and a plain fade.
//
// The <Logo> here is the current placeholder mark; swap it for the final
// LIFE PLUS logo (an <img>/<svg>) without touching the animation shell.
export function SplashScreen() {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // private mode / storage blocked — treat as not seen, show once
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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
        >
          {/* soft radial halo behind the mark */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute h-[42vmin] w-[42vmin] rounded-full"
            style={{
              background:
                "radial-gradient(circle, color-mix(in srgb, var(--accent-faith) 22%, transparent), transparent 70%)",
            }}
            initial={reduceMotion ? { opacity: 0.6 } : { opacity: 0, scale: 0.6 }}
            animate={
              reduceMotion
                ? { opacity: 0.6 }
                : { opacity: [0, 0.9, 0.55], scale: [0.6, 1.15, 1] }
            }
            transition={{ duration: 1.6, ease: "easeOut" }}
          />

          <motion.div
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.82, filter: "blur(6px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 120, damping: 16, mass: 0.9 }
            }
          >
            <Logo size={112} />
          </motion.div>

          <motion.p
            className="text-sm font-medium uppercase text-foreground/90"
            style={{ letterSpacing: reduceMotion ? "0.32em" : undefined }}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, letterSpacing: "0.6em", y: 8 }}
            animate={{ opacity: 1, letterSpacing: "0.32em", y: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.7, delay: 0.35, ease: "easeOut" }}
          >
            {APP_NAME}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
