import type { LifeAreaKey, MomentCategory } from "@/types";

// The single source of truth for life-area presentation *data*. Previously
// this mapping was independently duplicated in store/useAtlasStore.ts,
// components/features/QuickCapture.tsx, app/areas/page.tsx, and
// app/timeline/page.tsx — see docs/TECH_DEBT.md #11. Add a 6th life area by
// editing this file (and lib/lifeAreaIcons.ts for its icon).
//
// Deliberately NO lucide-react import here: this module is pulled in
// server-side via lib/mappers.ts -> lib/context/buildAtlasContext.ts, and a
// React-component import would drag the React runtime into every server job
// (it broke the standalone `npm run cron` runner). Icons live in the
// client-only lib/lifeAreaIcons.ts.
export interface LifeAreaMeta {
  key: LifeAreaKey;
  slug: string;
  label: string;
  pageTitle: string;
  colorVar: string;
}

export const LIFE_AREAS: Record<LifeAreaKey, LifeAreaMeta> = {
  faith: {
    key: "faith",
    slug: "torah",
    label: "אמונה",
    pageTitle: "מרחב תורה",
    colorVar: "--accent-faith",
  },
  family: {
    key: "family",
    slug: "family",
    label: "משפחה",
    pageTitle: "לוח משפחה",
    colorVar: "--accent-family",
  },
  knowledge: {
    key: "knowledge",
    slug: "learning",
    label: "ידע",
    pageTitle: "למידה",
    colorVar: "--accent-knowledge",
  },
  health: {
    key: "health",
    slug: "health",
    label: "בריאות",
    pageTitle: "בריאות",
    colorVar: "--accent-health",
  },
  career: {
    key: "career",
    slug: "career",
    label: "קריירה",
    pageTitle: "קריירה",
    colorVar: "--accent-career",
  },
};

export const LIFE_AREA_LIST: LifeAreaMeta[] = Object.values(LIFE_AREAS);

const GENERAL_LABEL = "כללי";
const GENERAL_COLOR_VAR = "--muted";

export function momentCategoryLabel(category: MomentCategory): string {
  return category === "general" ? GENERAL_LABEL : LIFE_AREAS[category].label;
}

export function momentCategoryColorVar(category: MomentCategory): string {
  return category === "general" ? GENERAL_COLOR_VAR : LIFE_AREAS[category].colorVar;
}

export function lifeAreaBySlug(slug: string): LifeAreaMeta | undefined {
  return LIFE_AREA_LIST.find((area) => area.slug === slug);
}
