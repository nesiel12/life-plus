// Deep Onboarding (docs/ATLAS_ARCHITECTURE_VISION.md §3/§12): a real AI
// conversation, not a static question list, powered by the same
// lib/ai/service.ts every other AI-backed route already uses. Kept fully
// pure/DB-free so it stays unit-testable the same way every other
// Intelligence-adjacent module in this app already is — app/api/onboarding/
// message/route.ts is the thin orchestrator that calls the AI, then calls
// this module to decide what actually happened.
//
// The one deliberate trust boundary: the model's own reply/extraction is
// never the authority on whether onboarding is "done." isOnboardingComplete
// only ever looks at the real, already-merged PersonalDNA/people state (plus
// a hard turn cap as a backstop) — the model can wander, restate, or ask a
// follow-up, but it cannot talk its way into ending the conversation before
// the five real topics are actually covered, nor keep it open forever.
import { z } from "zod";
import type { PersonalDNA } from "@/types";

export const ONBOARDING_TOPICS = ["family", "career", "habits", "sleep", "focus"] as const;
export type OnboardingTopic = (typeof ONBOARDING_TOPICS)[number];

const TOPIC_LABEL: Record<OnboardingTopic, string> = {
  family: "משפחה",
  career: "קריירה",
  habits: "הרגלים יומיומיים",
  sleep: "שינה",
  focus: "שעות ריכוז ואנרגיה",
};

// A safety backstop, not a target — real conversations finish in 5-6
// exchanges once all five topics are covered; this only protects against a
// model that keeps finding new follow-up questions to ask.
export const MAX_ONBOARDING_TURNS = 10;

export const OnboardingExtractionSchema = z.object({
  reply: z.string().min(1),
  extracted: z
    .object({
      people: z
        .array(
          z.object({
            name: z.string().min(1),
            relation: z.string().min(1),
            birthday: z.string().optional(),
          })
        )
        .default([]),
      careerNotes: z.string().optional(),
      habitNotes: z.array(z.string()).default([]),
      sleepNotes: z.string().optional(),
      peakFocusHours: z.string().optional(),
      learningStyle: z.string().optional(),
      motivationTriggers: z.array(z.string()).default([]),
    })
    .default({ people: [], habitNotes: [], motivationTriggers: [] }),
  topicsSkipped: z.array(z.enum(ONBOARDING_TOPICS)).default([]),
});
export type OnboardingExtraction = z.infer<typeof OnboardingExtractionSchema>;
export type ExtractedOnboardingFields = OnboardingExtraction["extracted"];

export interface OnboardingChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface OnboardingKnownState {
  personalDNA: PersonalDNA;
  hasFamily: boolean;
}

// Deterministic ground truth for which topics are actually satisfied —
// never derived from what the model claims, only from real merged data
// (plus whatever the user explicitly asked to skip this session).
export function deriveCoveredTopics(state: OnboardingKnownState, skipped: OnboardingTopic[]): OnboardingTopic[] {
  const covered = new Set<OnboardingTopic>(skipped);
  if (state.hasFamily) covered.add("family");
  if (state.personalDNA.careerNotes) covered.add("career");
  if (state.personalDNA.habitNotes.length > 0) covered.add("habits");
  if (state.personalDNA.sleepNotes) covered.add("sleep");
  if (state.personalDNA.peakFocusHours) covered.add("focus");
  return ONBOARDING_TOPICS.filter((topic) => covered.has(topic));
}

export function isOnboardingComplete(covered: OnboardingTopic[], turnsAsked: number): boolean {
  if (turnsAsked >= MAX_ONBOARDING_TURNS) return true;
  return ONBOARDING_TOPICS.every((topic) => covered.includes(topic));
}

// Arrays accumulate and dedupe — a later turn's habit doesn't erase an
// earlier one. Scalar fields only overwrite when the model actually
// extracted something non-empty this turn: an absent field means "nothing
// new said," not "clear the existing answer."
export function mergePersonalDnaPatch(
  existing: PersonalDNA,
  extracted: ExtractedOnboardingFields
): Partial<PersonalDNA> {
  const dedupe = (a: string[], b: string[]) => Array.from(new Set([...a, ...b.map((s) => s.trim()).filter(Boolean)]));
  return {
    peakFocusHours: extracted.peakFocusHours?.trim() || existing.peakFocusHours,
    learningStyle: extracted.learningStyle?.trim() || existing.learningStyle,
    careerNotes: extracted.careerNotes?.trim() || existing.careerNotes,
    sleepNotes: extracted.sleepNotes?.trim() || existing.sleepNotes,
    habitNotes: dedupe(existing.habitNotes, extracted.habitNotes),
    motivationTriggers: dedupe(existing.motivationTriggers, extracted.motivationTriggers),
  };
}

// "MM-DD" only, matching the people.birthday check constraint — validated
// here (not in the zod schema itself) so a model reply with a birthday in
// some other format degrades to "no birthday captured" rather than failing
// the whole structured-output call.
export function isValidBirthday(value: string | undefined): value is string {
  return typeof value === "string" && /^\d{2}-\d{2}$/.test(value);
}

function formatTranscript(history: OnboardingChatTurn[]): string {
  if (history.length === 0) {
    return "(השיחה עוד לא התחילה — זו הפנייה הראשונה שלך אליו.)";
  }
  return history.map((turn) => `${turn.role === "user" ? "המשתמש" : "אטלס"}: ${turn.content}`).join("\n");
}

export function buildOnboardingSystemPrompt(params: {
  displayName: string;
  covered: OnboardingTopic[];
  turnsAsked: number;
}): string {
  const remaining = ONBOARDING_TOPICS.filter((topic) => !params.covered.includes(topic));
  const turnsLeft = Math.max(0, MAX_ONBOARDING_TURNS - params.turnsAsked);

  const remainingLine =
    remaining.length > 0
      ? `נושאים שעדיין לא נענו: ${remaining.map((topic) => TOPIC_LABEL[topic]).join(", ")}.`
      : "כל הנושאים כבר כוסו — אל תשאל עוד שאלות. הגב/י בהודעת סיום חמה וקצרה שמסכמת ומודה לו.";

  return `את/ה אטלס — בן/בת לוויה אישי, רגוע/ה וחם/ה, שמדבר/ת עברית טבעית וזורמת בלבד (לעולם לא אנגלית).
את/ה מנהל/ת שיחת היכרות ראשונית עם ${params.displayName || "המשתמש"} כדי להכיר אותו/ה טוב יותר —
לא למלא טופס.

כללים:
- שאל/י שאלה אחת בכל פעם. לעולם אל תשאל/י כמה שאלות באותה הודעה.
- תן/י לתשובה הקודמת שלו להוביל את השיחה באופן טבעי, כמו שיחה אמיתית בין אנשים.
- אם הוא מעדיף לדלג על נושא, כבד/י את זה מיד ועבר/י הלאה בלי להתעקש — סמן/י את זה ב-topicsSkipped.
- אל תמציא/י מידע שלא נאמר בפועל. חלץ/י ל-extracted רק מה שהוא באמת אמר בתשובתו האחרונה.
- אם הזכיר בן/בת משפחה, הוסף/י אותם למערך extracted.people עם name ו-relation (ותאריך לידה רק אם
  ניתן בבירור, בפורמט MM-DD).

הנושאים שצריך לכסות: משפחה, קריירה, הרגלים יומיומיים, שינה, שעות ריכוז ואנרגיה. ${remainingLine}
נותרו כ-${turnsLeft} חילופי דברים לפני שהשיחה צריכה להסתיים.`;
}

export function buildOnboardingPrompt(history: OnboardingChatTurn[]): string {
  return `${formatTranscript(history)}\n\nהגב/י כעת בהתאם להנחיות שקיבלת ב-system.`;
}
