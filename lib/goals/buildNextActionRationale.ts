import type { GoalStage } from "@/lib/goals/types";

export interface TaskSizePreference {
  value: "smallTasks" | "largeTasks";
  confidence: number;
}

export interface RationaleInput {
  stage: GoalStage;
  isWeakestLifeArea: boolean;
  hasRelatedMemory: boolean;
  taskSizePreference: TaskSizePreference | null;
}

// "Why this matters" for a goal's next recommended action — one honest
// sentence, prioritized by how real/strong the signal is, never a
// fabricated insight when none of the real ones apply. Mirrors app/api/
// calendar/suggestions/route.ts's own rationale-composition shape (a
// structural fact — "weakest area", "found a free slot" — optionally
// enriched with one behavioral signal), applied to goals instead of
// calendar slots.
export function buildNextActionRationale({
  stage,
  isWeakestLifeArea,
  hasRelatedMemory,
  taskSizePreference,
}: RationaleInput): string {
  if (stage === "stuck") {
    return "היעד הזה לא זז כבר יותר משבועיים — זה הזמן לצעד קטן קדימה.";
  }

  if (isWeakestLifeArea) {
    return "זה התחום עם המדד הכי נמוך כרגע, אז התקדמות כאן משנה יותר.";
  }

  if (hasRelatedMemory) {
    return "יש לך היסטוריה רלוונטית לזה — כדאי להיעזר בה.";
  }

  if (taskSizePreference?.value === "smallTasks") {
    return "אתה נוטה להתקדם טוב יותר כשמתמקדים בצעד אחד קטן וברור בכל פעם.";
  }

  return "זו אבן הדרך הבאה בתור ביעד.";
}
