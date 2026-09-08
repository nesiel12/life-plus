import { z } from "zod";

// StudyAgent (Sprint 2): the tutor that sits beside the video player.
//
// Three modes, one agent, because they share the same grounding context (the
// transcript) and the same persona. Splitting them into three routes would
// mean re-sending the transcript three times and letting the personas drift.
export type StudyMode = "summary" | "quiz" | "discuss" | "overview";

export const studySummarySchema = z.object({
  headline: z.string().describe("כותרת קצרה בעברית שמתמצתת את הסרטון"),
  keyPoints: z
    .array(z.string())
    .min(1)
    .max(7)
    .describe("הנקודות המרכזיות בעברית, כל אחת משפט אחד"),
  takeaway: z.string().describe("משפט אחד: מה הדבר החשוב ביותר לזכור"),
});

export const studyQuizSchema = z.object({
  question: z.string().describe("שאלה פתוחה אחת בעברית שבודקת הבנה, לא שינון"),
  hint: z.string().optional().describe("רמז קצר, רק אם השאלה קשה"),
});

export const studyGradeSchema = z.object({
  verdict: z
    .enum(["correct", "partial", "incorrect"])
    .describe("עד כמה התשובה נכונה ביחס לתוכן הסרטון"),
  feedback: z.string().describe("משוב קצר ומכבד בעברית, שמסביר מה חסר או מה היה טוב"),
  masteryDelta: z
    .number()
    .int()
    .min(-10)
    .max(20)
    .describe("כמה נקודות שליטה להוסיף או להוריד: correct 10-20, partial 3-9, incorrect -10 עד 0"),
});

export const studyOverviewSchema = z.object({
  headline: z.string().describe("כותרת קצרה בעברית: על מה כנראה הסרטון"),
  keyPoints: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("מה סביר שהסרטון מכסה, לפי הכותרת והנושא — כל שורה משפט אחד"),
  takeaway: z.string().describe("משפט אחד: הזווית המרכזית לצפייה איתה"),
  basis: z
    .string()
    .describe("משפט קצר שמבהיר שהסיכום מבוסס על כותרת הסרטון והנושא בלבד, לא על תמלול מלא"),
});

export type StudySummary = z.infer<typeof studySummarySchema>;
export type StudyOverview = z.infer<typeof studyOverviewSchema>;
export type StudyQuiz = z.infer<typeof studyQuizSchema>;
export type StudyGrade = z.infer<typeof studyGradeSchema>;

const BASE_PERSONA = [
  "אתה מורה פרטי בתוך Life Plus. אתה מלמד בעברית טבעית, בגובה העיניים, בלי התנשאות ובלי סופרלטיבים.",
  "אתה מבסס את כל מה שאתה אומר אך ורק על התמלול שנמסר לך. אם משהו לא מופיע בתמלול — אמור זאת במפורש ואל תמציא.",
].join("\n");

export const STUDY_AGENT_SYSTEM: Record<StudyMode, string> = {
  overview: [
    "אתה מורה פרטי בתוך Life Plus. אתה מלמד בעברית טבעית, בגובה העיניים.",
    "לא נמסר לך תמלול. נמסרו לך כותרת הסרטון, שם הערוץ (אם יש), והנושא שהמשתמש לומד.",
    "המשימה: לתת סקירה מקדימה מועילה — מה הסרטון כנראה מכסה ואיך כדאי לגשת אליו — על סמך הכותרת, הערוץ, והידע הכללי שלך על הנושא.",
    "אל תמציא ציטוטים או נתונים ספציפיים כאילו הם מהסרטון. נסח בזהירות ('כנראה', 'סביר ש').",
    "ב-basis כתוב במפורש שהסקירה מבוססת על הכותרת והנושא ולא על תמלול מלא.",
  ].join("\n"),
  summary: [
    BASE_PERSONA,
    "המשימה: לסכם את הסרטון בצורה שתאפשר למישהו להבין את העיקר בלי לצפות.",
    "אל תחזור על אותה נקודה בניסוחים שונים.",
  ].join("\n"),
  quiz: [
    BASE_PERSONA,
    "המשימה: לשאול שאלה פתוחה אחת שבודקת האם המשתמש באמת הבין את הרעיון, לא האם הוא זוכר מילה.",
    "התאם את רמת הקושי לרמת השליטה הנוכחית שנמסרה לך: שליטה נמוכה — שאלת הבנה בסיסית, שליטה גבוהה — שאלת יישום או השוואה.",
    "אל תשאל שאלה שכבר נשאלה.",
  ].join("\n"),
  discuss: [
    BASE_PERSONA,
    "המשימה: לבדוק את תשובת המשתמש מול התמלול ולתת משוב.",
    "היה הוגן: אם התשובה נכונה בעיקרה אך חסרה פרט, זה partial ולא incorrect.",
    "אם המשתמש טועה, הסבר את הנכון בקצרה במקום רק לפסול.",
  ].join("\n"),
};

/** Transcripts routinely exceed the context window; keep the prompt bounded. */
export const MAX_TRANSCRIPT_CHARS = 12_000;

export function truncateTranscript(transcript: string): string {
  const clean = transcript.trim();
  if (clean.length <= MAX_TRANSCRIPT_CHARS) return clean;
  // Keep the head and tail: intros state the thesis, conclusions restate it,
  // and the middle is the most redundant part of a lecture transcript.
  const half = Math.floor(MAX_TRANSCRIPT_CHARS / 2);
  return `${clean.slice(0, half)}\n\n[...הושמט חלק מהתמלול...]\n\n${clean.slice(-half)}`;
}

/**
 * Mastery is a 0-100 running score per resource. Clamped here rather than at
 * the call site so every consumer agrees on the bounds.
 */
export function applyMasteryDelta(current: number, delta: number): number {
  return Math.max(0, Math.min(100, Math.round(current + delta)));
}

export function masteryLabel(score: number): string {
  if (score >= 85) return "שליטה מלאה";
  if (score >= 60) return "שליטה טובה";
  if (score >= 30) return "בתהליך";
  return "בהתחלה";
}
