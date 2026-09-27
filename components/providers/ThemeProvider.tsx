"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  DARK_MEDIA_QUERY,
  resolveTheme,
  readStoredPreference,
  THEME_STORAGE_KEY,
  themeInitScript as themeInitScriptImpl,
  type Theme,
  type ThemePreference,
} from "@/lib/theme/resolveTheme";

export type { Theme, ThemePreference };
export const themeInitScript = themeInitScriptImpl;

interface ThemeContextValue {
  /** The resolved, renderable theme — what every component and [data-theme] selector actually wants. */
  theme: Theme;
  /** What's stored: "system" if the person hasn't overridden it. Drives the settings picker. */
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  /** Explicit light<->dark, same as before — a quick tap always leaves "system" mode for an explicit choice, matching how iOS/Android's own quick toggles behave. Settings is the only place "system" can be chosen. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_MEDIA_QUERY).matches;
}

// LIFE PLUS is white-first: light is the default resolution when the OS has
// no opinion (matchMedia unsupported) or on the server. The <html data-theme>
// attribute is set synchronously before paint by the inline script below (no
// flash of wrong theme, including for "system" — it reads the OS preference
// too, not just localStorage); this provider keeps React state in sync,
// persists changes, and — new — keeps "system" live: an OS-level theme
// change (flipping to Dark Mode at sunset, say) is picked up immediately
// without a reload, for as long as the person hasn't explicitly overridden it.
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    // The init script already resolved and applied the real value before
    // paint; read it back rather than re-deriving, so hydration can't
    // disagree with what's already on screen for a beat.
    const attr = document.documentElement.dataset.theme;
    const stored = readStoredPreference(localStorage);
    setPreferenceState(stored);
    setThemeState(attr === "dark" || attr === "light" ? attr : resolveTheme(stored, systemPrefersDark()));
  }, []);

  useEffect(() => {
    if (preference !== "system") return;
    const mql = window.matchMedia(DARK_MEDIA_QUERY);
    const onChange = () => {
      const next = resolveTheme("system", mql.matches);
      setThemeState(next);
      document.documentElement.dataset.theme = next;
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    const next = resolveTheme(p, systemPrefersDark());
    setThemeState(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(theme === "dark" ? "light" : "dark");
  }, [theme, setPreference]);

  return <ThemeContext.Provider value={{ theme, preference, setPreference, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
