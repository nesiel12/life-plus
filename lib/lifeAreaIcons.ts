import { BookOpen, HeartHandshake, Lightbulb, HeartPulse, Briefcase, type LucideIcon } from "lucide-react";
import type { LifeAreaKey } from "@/types";

// The icon half of lib/lifeAreas.ts, split out so the data module stays free
// of any React-component import (it's used server-side — see the note there).
// Client components that render a life area pair LIFE_AREAS[key] with
// LIFE_AREA_ICONS[key].
export const LIFE_AREA_ICONS: Record<LifeAreaKey, LucideIcon> = {
  faith: BookOpen,
  family: HeartHandshake,
  knowledge: Lightbulb,
  health: HeartPulse,
  career: Briefcase,
};
