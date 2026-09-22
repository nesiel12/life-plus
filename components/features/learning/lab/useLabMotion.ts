"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * Whether the lab should hold back its motion.
 *
 * The person's OS setting always wins. In development only, "?motion=reduce"
 * forces it on as well, so the reduced-motion paths can be exercised without
 * changing an operating-system setting (NODE_ENV is inlined at build time, so
 * the override is dead code in production).
 */
export function useLabReducedMotion(): boolean {
  const system = Boolean(useReducedMotion());
  const [forced, setForced] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    setForced(new URLSearchParams(window.location.search).get("motion") === "reduce");
  }, []);

  return system || forced;
}
