"use client";

import { useEffect, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { APP_LAUNCH_EVENT, splashPending } from "@/components/layout/SplashScreen";
import { macLaunchVariants } from "@/lib/motion/macLaunch";

/** If the splash never announces (storage blocked, a missed event), launch anyway. */
const LAUNCH_FALLBACK_MS = 4000;

/**
 * The app's main window, opening the way a macOS app opens: from ~95% and
 * transparent to full size, in ~300ms (lib/motion/macLaunch.ts).
 *
 * It plays once per page load, when the window actually becomes visible —
 * immediately when there is no splash, or the moment the splash starts to
 * leave, so the window opens out of it rather than behind it.
 *
 * Only the page column animates. Scaling a wrapper that contains the fixed
 * tab bar or the AI companion would re-anchor them to the wrapper for the
 * length of the animation (a transformed ancestor becomes the containing
 * block of fixed descendants), and they would visibly jump.
 */
export function AppWindow({ children, className }: { children: ReactNode; className?: string }) {
  const reduceMotion = Boolean(useReducedMotion());
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    if (!splashPending()) {
      setLaunched(true);
      return;
    }
    const launch = () => setLaunched(true);
    window.addEventListener(APP_LAUNCH_EVENT, launch, { once: true });
    const fallback = window.setTimeout(launch, LAUNCH_FALLBACK_MS);
    return () => {
      window.removeEventListener(APP_LAUNCH_EVENT, launch);
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <motion.div
      variants={macLaunchVariants(reduceMotion)}
      initial="hidden"
      animate={launched ? "visible" : "hidden"}
      style={{ transformOrigin: "50% 40%" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
