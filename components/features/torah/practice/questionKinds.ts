import { BookOpenCheck, GitCompareArrows, Lightbulb, Scale, Swords, Target, type LucideIcon } from "lucide-react";
import type { PracticeQuestionKind } from "@/lib/torah/lessons/types";

/** How each kind of practice question presents itself. */
export const QUESTION_KINDS: Record<PracticeQuestionKind, { label: string; icon: LucideIcon; tone: string }> = {
  dilemma: { label: "דילמה תלמודית", icon: Scale, tone: "bg-accent-career/12 text-accent-career" },
  counter: { label: "קושיא להשיב עליה", icon: Swords, tone: "bg-accent-family/12 text-accent-family" },
  application: { label: "יישום מעשי", icon: Target, tone: "bg-accent-health/12 text-accent-health" },
  scenario: { label: "תרחיש", icon: Lightbulb, tone: "bg-gold-soft text-gold-ink" },
  compare: { label: "השוואה", icon: GitCompareArrows, tone: "bg-accent-knowledge/12 text-accent-knowledge" },
  recall: { label: "זיכרון", icon: BookOpenCheck, tone: "bg-fill-subtle text-muted" },
};
