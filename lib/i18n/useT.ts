"use client";

import { useCallback } from "react";
import { usePreferences } from "@/components/providers/PreferencesProvider";
import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";

export type { Locale, TranslationKey };

/**
 * `const t = useT(); t("nav.calendar")`.
 *
 * Falls back to the Hebrew string for any key not yet in the `en` dictionary,
 * and to the key itself only if it is in neither — so an untranslated screen
 * reads in Hebrew, never as `nav.calendar`.
 */
export function useT() {
  const { preferences } = usePreferences();
  const locale: Locale = preferences.language;

  return useCallback(
    (key: TranslationKey): string => {
      const table = dictionaries[locale] as Record<string, string>;
      const he = dictionaries.he as Record<string, string>;
      return table[key] ?? he[key] ?? key;
    },
    [locale]
  );
}

/** The active locale, for the rare caller that needs to branch on it. */
export function useLocale(): Locale {
  return usePreferences().preferences.language;
}
