import type { RelationshipHealth, SuggestedActionType } from "@/lib/family/types";

export interface SuggestedActionInput {
  health: RelationshipHealth;
  daysUntilBirthday: number | null;
  hasRelatedMemory: boolean;
}

export interface PickedAction {
  type: SuggestedActionType;
  label: string;
  rationale: string;
}

const BIRTHDAY_WINDOW_DAYS = 7;

// Deterministic, never LLM-generated — mirrors how every other "next
// action" in this app works (Goals' next milestone, Learning's next
// review): a real signal picks the action type, a template renders the
// rationale. "Pray" was deliberately not included as an action type — there
// is no real signal (health/wellbeing data) behind it for any person, and
// fabricating one would be exactly the invented-insight this app's
// intelligence layer has never done anywhere else.
export function pickSuggestedAction({ health, daysUntilBirthday, hasRelatedMemory }: SuggestedActionInput): PickedAction {
  if (daysUntilBirthday !== null && daysUntilBirthday >= 0 && daysUntilBirthday <= BIRTHDAY_WINDOW_DAYS) {
    return {
      type: "congratulate",
      label: "לברך ליום הולדת",
      rationale: daysUntilBirthday === 0 ? "יום ההולדת היום!" : `יום ההולדת מתקרב בעוד ${daysUntilBirthday} ימים.`,
    };
  }

  if (health === "needs_attention") {
    return { type: "call", label: "להתקשר", rationale: "עבר יותר מדי זמן מאז הקשר האחרון." };
  }

  if (health === "growing") {
    return { type: "message", label: "לשלוח הודעה", rationale: "כדאי לשמור על קצב הקשר לפני שהוא נחלש." };
  }

  if (hasRelatedMemory) {
    return { type: "meet", label: "להיפגש", rationale: "יש לכם היסטוריה משותפת שכדאי להמשיך." };
  }

  return { type: "message", label: "לשלוח הודעה", rationale: "רק כדי להישאר בקשר." };
}
