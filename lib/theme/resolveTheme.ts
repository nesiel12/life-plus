// Pure theme-resolution logic, kept out of ThemeProvider.tsx (which is JSX
// and so can't be loaded directly by this project's vitest setup — see
// lib/query/offlineSnapshot.ts for the same split, same reason). Both the
// React provider and the pre-paint inline script build off these exact same
// constants and rules, so they can never quietly disagree about what
// "system" resolves to.

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

export const THEME_STORAGE_KEY = "lifeplus.theme";
export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function readStoredPreference(storage: Pick<Storage, "getItem">): ThemePreference {
  try {
    const stored = storage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") return stored;
  } catch {
    /* storage blocked */
  }
  return "system";
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  return preference === "system" ? (systemPrefersDark ? "dark" : "light") : preference;
}

// Runs before first paint (dangerouslySetInnerHTML in <head>) so the correct
// theme attribute is on <html> before any CSS resolves — including the
// "system" case, which needs the OS's own prefers-color-scheme read
// synchronously too, not just whatever was in localStorage.
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");var resolved=(t==="dark"||t==="light")?t:(window.matchMedia&&window.matchMedia("${DARK_MEDIA_QUERY}").matches?"dark":"light");document.documentElement.dataset.theme=resolved}catch(e){document.documentElement.dataset.theme="light"}})();`;
