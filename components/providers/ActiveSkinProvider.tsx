"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getShopStateAction, setActiveThemeAction } from "@/app/actions/xpShop";

const STORAGE_KEY = "lifeplus.skin";

interface ActiveSkinContextValue {
  skin: string | null;
  /** Equips (or un-equips, with null) a purchased theme — updates the DOM/cache immediately and persists server-side. */
  setSkin: (skinId: string | null) => Promise<void>;
}

const ActiveSkinContext = createContext<ActiveSkinContextValue | null>(null);

function applySkin(skinId: string | null) {
  if (skinId) document.documentElement.dataset.skin = skinId;
  else delete document.documentElement.dataset.skin;
  try {
    if (skinId) localStorage.setItem(STORAGE_KEY, skinId);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A skin not remembered next visit is a cosmetic nit, not worth failing over.
  }
}

/**
 * The XP Shop's purchased-theme equip state — an orthogonal, additive
 * layer on top of ThemeProvider's own light/dark [data-theme] (left
 * completely untouched; see app/globals.css's own comment on why these
 * two attributes are kept separate). Mounted at the root layout, not
 * scoped to the Learning module: "App Themes" re-skin the whole app once
 * equipped, the same way light/dark already does — unlike the particle
 * trail canvas, which is deliberately Learning-only.
 *
 * No blocking inline script like the theme pair's themeInitScript: a skin
 * flash on first paint is a cosmetic nit, not the accessibility-relevant
 * light/dark choice that earned that engineering investment. localStorage
 * gives instant paint on repeat visits; the server call (which silently
 * no-ops if the person isn't signed in yet, e.g. on /login) is what stays
 * authoritative and syncs back any change made from another device.
 */
export function ActiveSkinProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        setSkinState(cached);
        document.documentElement.dataset.skin = cached;
      }
    } catch {
      // localStorage blocked — falls through to the server value below.
    }

    getShopStateAction()
      .then((state) => {
        if (state.activeTheme !== null) {
          setSkinState(state.activeTheme);
          applySkin(state.activeTheme);
        }
      })
      .catch(() => {
        // Not signed in yet, or a transient failure — the app still works
        // with whatever skin (or none) is already applied.
      });
  }, []);

  async function setSkin(skinId: string | null) {
    setSkinState(skinId);
    applySkin(skinId);
    await setActiveThemeAction(skinId).catch(() => {
      // The DOM/cache already reflect the choice; a failed server sync
      // just means it won't be remembered on another device.
    });
  }

  return <ActiveSkinContext.Provider value={{ skin, setSkin }}>{children}</ActiveSkinContext.Provider>;
}

export function useActiveSkin(): ActiveSkinContextValue {
  const ctx = useContext(ActiveSkinContext);
  if (!ctx) throw new Error("useActiveSkin must be used within <ActiveSkinProvider>");
  return ctx;
}
