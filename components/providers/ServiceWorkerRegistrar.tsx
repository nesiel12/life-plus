"use client";

import { useEffect } from "react";

// Registers /sw.js once, after load. The worker is push- and
// installability-only (no offline cache), so registration failing is a
// non-event — push simply won't be offered.
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* unsupported / blocked — fine */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
