import { BookOpen, HeartHandshake, Lightbulb, HeartPulse, Briefcase, type LucideIcon } from "lucide-react";
import type { LifeAreaKey, MomentCategory } from "@/types";

// The single source of truth for life-area presentation. Previously this
// mapping was independently duplicated in store/useAtlasStore.ts,
// components/features/QuickCapture.tsx, app/areas/page.tsx, and
// app/timeline/page.tsx — see docs/TECH_DEBT.md #11. Add a 6th life area by
// editing only this file.
export interface LifeAreaMeta {
  key: LifeAreaKey;
  slug: string;
  label: string;
  pageTitle: string;
  colorVar: string;
  icon: LucideIcon;
}

export const LIFE_AREAS: Record<LifeAreaKey, LifeAreaMeta> = {
  faith: {
    key: "faith",
    slug: "torah",
    label: "אמונה",
    pageTitle: "מרחב תורה",
    colorVar: "--accent-faith",
    icon: BookOpen,
  },
  family: {
    key: "family",
    slug: "family",
    label: "משפחה",
    pageTitle: "לוח משפחה",
    colorVar: "--accent-family",
    icon: HeartHandshake,
  },
  knowledge: {
    key: "knowledge",
    slug: "learning",
    label: "ידע",
    pageTitle: "למידה",
    colorVar: "--accent-knowledge",
    icon: Lightbulb,
  },
  health: {
    key: "health",
    slug: "health",
    label: "בריאות",
    pageTitle: "בריאות",
    colorVar: "--accent-health",
    icon: HeartPulse,
  },
  career: {
    key: "career",
    slug: "career",
    label: "קריירה",
    pageTitle: "קריירה",
    colorVar: "--accent-career",
    icon: Briefcase,
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
