// The Feynman Simulator ("הסבר במילים פשוטות"): the user explains a concept in
// their own plain Hebrew, and the model marks how clear it actually was and
// what is missing. Grading a free-text explanation is not something a pure
// function can do — this module is the prompt/answer contract around the one
// model call (app/api/ai/learning-lab/route.ts, mode "feynmanGrade"), kept
// separate and testable exactly like lib/ai/agentRouter.ts's grounding
// functions: the model classifies and writes prose, and never states a fact
// this module didn't hand it.

export interface FeynmanPromptInput {
  topicTitle: string;
  /** What the explanation was supposed to cover — kept short; a whole syllabus dumped into the prompt buries the point. */
  concept: string;
  explanation: string;
}

const MAX_EXPLANATION_CHARS = 4000;

export function buildFeynmanPrompt(input: FeynmanPromptInput): string {
  const explanation = input.explanation.trim().slice(0, MAX_EXPLANATION_CHARS);
  return [
    `הנושא: "${input.topicTitle}".`,
    `המושג שצריך להסביר: "${input.concept}".`,
    "ההסבר של המשתמש, במילים שלו:",
    explanation,
  ].join("\n");
}

export const FEYNMAN_SYSTEM = [
  "אתה בוחן שיטת פיינמן: המשתמש מנסה להסביר מושג במילים פשוטות שלו, כאילו הוא מסביר למישהו שלא מכיר את הנושא.",
  "המטרה שלך היא לזהות פערי הבנה אמיתיים — לא לתקן ניסוח או לבדוק דקדוק.",
  "clarityScore הוא 0 עד 100: עד כמה ההסבר עצמו (לא הידע הכללי של המשתמש) ברור ומדויק.",
  "gaps הן רק דברים שההסבר החמיץ, טעה בהם, או השאיר מעורפלים — קצר וממוקד, לא רשימה כללית של 'עוד דברים לדעת על הנושא'.",
  "אם ההסבר ריק, מבולבל לגמרי, או לא קשור למושג — clarityScore נמוך ו-gaps אומר זאת בפירוש, לא ממציא מה שכן נאמר.",
  "feedback הוא משפט או שניים, ישירים ותומכים, בעברית.",
].join("\n");

export interface FeynmanEvaluation {
  clarityScore: number;
  gaps: string[];
  feedback: string;
}

/** How the score should read, for the UI's colour/tone — not a second grading pass. */
export type ClarityBand = "unclear" | "partial" | "clear" | "excellent";

export function clarityBand(score: number): ClarityBand {
  if (score < 35) return "unclear";
  if (score < 65) return "partial";
  if (score < 85) return "clear";
  return "excellent";
}

export const CLARITY_BAND_LABELS: Record<ClarityBand, string> = {
  unclear: "לא ברור עדיין",
  partial: "בדרך הנכונה",
  clear: "הסבר ברור",
  excellent: "הסבר מצוין",
};
