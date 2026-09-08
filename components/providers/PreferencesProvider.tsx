"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// App-wide display preferences that belong to the device, not the account —
// the same tier as theme. Server-side per-user settings (notifications,
// timezone, quiet hours) live in the DB via app/actions/notificationPreferences;
// this is for choices that only affect how the current browser renders.
//
// Deliberately one small object with one setter, so adding the next
// preference (date format, density, reduced-motion override, …) is a one-line
// change to Preferences and its defaults — the "infrastructure for future
// preferences" this is meant to be.

export type AppLanguage = "he" | "en";

export interface Preferences {
  language: AppLanguage;
}

const DEFAULTS: Preferences = {
  language: "he",
};

const STORAGE_KEY = "lifeplus.preferences.v1";

interface PreferencesContextValue {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readStored(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      language: parsed.language === "en" || parsed.language === "he" ? parsed.language : DEFAULTS.language,
    };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    setPreferences(readStored());
  }, []);

  // Keep the document in sync so CSS and assistive tech see the right
  // language. `dir` stays rtl until the UI strings are actually translated —
  // flipping layout direction while every label is still Hebrew is worse than
  // not flipping it. The value is persisted and read by t()/future work.
  useEffect(() => {
    document.documentElement.lang = preferences.language;
  }, [preferences.language]);

  const setPreference = useCallback<PreferencesContextValue["setPreference"]>((key, value) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked — value still applies for this session */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ preferences, setPreference }), [preferences, setPreference]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within <PreferencesProvider>");
  return ctx;
}
