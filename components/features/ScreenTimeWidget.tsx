"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

const STORAGE_PREFIX = "atlas:screenTime:";
const TICK_MS = 15_000;

// The user's own device day boundary, not Personal DNA's hardcoded
// Asia/Jerusalem convention (lib/intelligence/personalDNA/timezone.ts) —
// this widget runs entirely client-side, same reasoning lib/greeting.ts
// already used for not importing that module into a plain browser-side
// concern.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readStoredSeconds(key: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
  return raw ? Number(raw) || 0 : 0;
}

// A real, honestly-labeled metric (docs/ATLAS_ARCHITECTURE_VISION.md §12):
// only how long *this Atlas tab* was open and in the foreground today,
// tracked client-side via localStorage — never framed as true OS/device
// screen time, which a web app has no access to and this app never claims
// to measure. Ticks only while the tab is visible and focused, so leaving
// it open in a background tab all day doesn't inflate the number.
export function ScreenTimeWidget() {
  const [seconds, setSeconds] = useState<number | null>(null);
  const keyRef = useRef(todayKey());

  useEffect(() => {
    keyRef.current = todayKey();
    setSeconds(readStoredSeconds(keyRef.current));

    const interval = setInterval(() => {
      const key = todayKey();
      if (key !== keyRef.current) {
        keyRef.current = key;
        setSeconds(0);
        return;
      }
      if (document.hidden || !document.hasFocus()) return;
      setSeconds((prev) => {
        const next = (prev ?? 0) + TICK_MS / 1000;
        window.localStorage.setItem(STORAGE_PREFIX + key, String(next));
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, []);

  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);

  return (
    <p className="mb-6 flex items-center gap-1.5 text-xs text-muted">
      <Clock size={12} aria-hidden />
      {minutes < 1 ? "פחות מדקה ב-Life Plus היום" : `${minutes} דקות ב-Life Plus היום`}
    </p>
  );
}
