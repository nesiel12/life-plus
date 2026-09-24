// What the masterclass lesson's loading state can say while the lesson is
// streaming in (app/api/learning/lesson/generate → LessonViewport): which
// sections the model has already written. Pure, for the test.

const SECTIONS: { key: string; label: string }[] = [
  { key: "originStory", label: "סיפור הרקע" },
  { key: "pioneers", label: "דמויות מפתח" },
  { key: "coreContent", label: "ליבת החומר" },
  { key: "blooperOrDisaster", label: "פדיחה היסטורית" },
  { key: "mindBlowingTrivia", label: "עובדות מפתיעות" },
  { key: "inlineCheckpoints", label: "שאלות בדיקה" },
];

/**
 * Section labels in generation order, each marked done once a *later* field
 * has started (the model writes fields in schema order, so the field after
 * one existing means that one is finished) — or, for the last field seen, still
 * in progress.
 */
export function lessonStreamProgress(partial: unknown): { label: string; state: "done" | "writing" | "pending" }[] {
  const p = partial && typeof partial === "object" ? (partial as Record<string, unknown>) : {};
  const present = SECTIONS.map((s) => p[s.key] !== undefined);
  const lastPresent = present.lastIndexOf(true);
  return SECTIONS.map((s, i) => ({
    label: s.label,
    state: !present[i] ? "pending" : i < lastPresent ? "done" : "writing",
  }));
}
