"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useNow } from "@/hooks/useNow";
import {
  DEFAULT_CONTEXT_PREFERENCE,
  parseContextOverride,
  parseContextPreference,
  resolveContext,
  type ContextPreference,
  type ResolvedContext,
} from "@/lib/dashboard/context";
import { energyCurve } from "@/lib/health/energyCurve";

const STORAGE_KEY = "lifeplus.dashboard.context";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function read(): ContextPreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? parseContextPreference(JSON.parse(raw)) : DEFAULT_CONTEXT_PREFERENCE;
  } catch {
    // Blocked storage or a half-written value: the feature is on by default,
    // and a preference is not worth an error.
    return DEFAULT_CONTEXT_PREFERENCE;
  }
}

function write(preference: ContextPreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // It still applies for this session; only its persistence is lost.
  }
}

/**
 * Everything the dashboard needs to be context-aware: the resolved window,
 * cards, promoted widgets and energy reading for right now, plus the on/off
 * switch.
 *
 * The preference is per device, in localStorage, like the layout it sits over
 * (hooks/useDashboardLayout.ts) — and for the same reason: it describes the
 * screen you are looking at. It is read in a layout effect so an "off" is
 * honoured before the first paint rather than flashing the band for a frame.
 *
 * The energy curve comes from the person's own chronotype (wake/sleep and
 * peak/low day-parts). Today's meals and workouts nudge the model on the
 * Health page; they are not loaded here, so the dashboard reads the baseline
 * curve, which is what a glance at "what suits this hour" needs.
 */
export function useDashboardContext() {
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);
  const realNow = useNow(60_000);
  const [override, setOverride] = useState<{ hour: number; minute: number } | null>(null);

  const [preference, setPreference] = useState<ContextPreference>(DEFAULT_CONTEXT_PREFERENCE);
  const [hydrated, setHydrated] = useState(false);

  useIsomorphicLayoutEffect(() => {
    setPreference(read());
    // Development only: "?contextAt=HH:MM" previews another hour. Read once, on
    // mount, so a fresh load renders that hour outright rather than animating
    // to it. NODE_ENV is inlined at build time, so this is dead code in production.
    if (process.env.NODE_ENV !== "production") setOverride(parseContextOverride(window.location.search));
    setHydrated(true);
  }, []);

  // Persist only after the stored value has been read, or the first render's
  // default would be written over a saved "off".
  useEffect(() => {
    if (hydrated) write(preference);
  }, [preference, hydrated]);

  const now = useMemo(() => {
    if (!realNow || !override) return realNow;
    const previewed = new Date(realNow);
    previewed.setHours(override.hour, override.minute, 0, 0);
    return previewed;
  }, [realNow, override]);

  const curve = useMemo(() => energyCurve({ chronotype }), [chronotype]);

  const context: ResolvedContext | null = useMemo(
    () => (now ? resolveContext(now, curve) : null),
    [now, curve]
  );

  const setEnabled = useCallback((enabled: boolean) => setPreference({ enabled }), []);

  return {
    now,
    context,
    enabled: preference.enabled,
    setEnabled,
    /** False until the clock and the stored preference have both been read. */
    ready: hydrated && now !== null,
  };
}
