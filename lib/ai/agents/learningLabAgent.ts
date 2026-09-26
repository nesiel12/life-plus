import { z } from "zod";
import { FEYNMAN_SYSTEM } from "@/lib/learning/feynman";

// The Learning lab's four model calls, one agent — same reasoning as
// StudyAgent (lib/ai/agents/studyAgent.ts): each mode is a distinct task with
// its own schema and persona, but they belong in one route because a caller
// working through a topic's canvas may reach for any of them in the same
// sitting, and splitting them would mean four routes re-deriving the same
// auth/quota/rate-limit boilerplate.
//
// Every mode is grounded in real data the caller already has (the topic's
// title, its resource titles, the user's own free-text explanation) — none of
// them is told to invent a fact and present it as one. "suggestTopics" is the
// one genuinely generative mode (new topic ideas do not exist in the data by
// definition), and its own instructions say so explicitly, so a suggestion
// never reads as something already true about the user.

export type LearningLabMode = "quiz" | "flashcards" | "chapterBreakdown" | "feynmanGrade" | "suggestTopics";

const questionKindSchema = z.enum(["mcq", "short"]);

export const quizQuestionSchema = z.object({
  prompt: z.string().min(1).describe("שאלה אחת, בעברית"),
  kind: questionKindSchema,
  // .nullable(), not .optional(): Groq's strict structured-output mode
  // requires every property listed — see lib/validations/learning.ts.
  options: z
    .array(z.string())
    .min(3)
    .max(5)
    .nullable()
    .describe("רק עבור mcq — כולל את התשובה הנכונה, בלי לסמן אותה. null עבור short"),
  correctAnswer: z.string().min(1).describe("הטקסט המדויק של האפשרות הנכונה (mcq), או תשובת מודל קצרה (short)"),
});

export const quizSchema = z.object({
  questions: z.array(quizQuestionSchema).min(3).max(5),
});
export type GeneratedQuiz = z.infer<typeof quizSchema>;

export const flashcardSchema = z.object({
  front: z.string().min(1).describe("צד השאלה — קצר וממוקד"),
  back: z.string().min(1).describe("צד התשובה — משפט או שניים, לא פסקה"),
});

export const flashcardDeckSchema = z.object({
  cards: z.array(flashcardSchema).min(3).max(12),
});
export type GeneratedFlashcards = z.infer<typeof flashcardDeckSchema>;

export const chapterBreakdownSchema = z.object({
  summary: z.string().min(1).describe("תקציר הפרק, 2-4 משפטים"),
  takeaways: z.array(z.string()).min(2).max(6).describe("נקודות מפתח, כל אחת משפט אחד"),
});
export type ChapterBreakdown = z.infer<typeof chapterBreakdownSchema>;

export const feynmanEvaluationSchema = z.object({
  clarityScore: z.number().int().min(0).max(100),
  gaps: z.array(z.string()).max(6).describe("פערים אמיתיים בהסבר בלבד — ריק אם ההסבר שלם"),
  feedback: z.string().min(1),
});
export type FeynmanEvaluation = z.infer<typeof feynmanEvaluationSchema>;

export const suggestedTopicSchema = z.object({
  title: z.string().min(1).describe("שם נושא לימוד חדש, קצר"),
  category: z.string().min(1).describe("קטגוריה קצרה, בעקביות עם הקטגוריות הקיימות של המשתמש כשמתאים"),
  reason: z.string().min(1).describe("משפט אחד: למה זה מתחבר למה שהמשתמש כבר לומד או למטרות שלו"),
});

export const topicSuggestionsSchema = z.object({
  suggestions: z.array(suggestedTopicSchema).min(1).max(3),
});
export type TopicSuggestions = z.infer<typeof topicSuggestionsSchema>;

const GROUNDING = "אתה מבסס את כל מה שאתה כותב אך ורק על החומר שנמסר לך. אם אין מספיק חומר לסוג המשימה — עדיין תמלא את הסכימה בצורה סבירה, אבל אל תמציא עובדות ספציפיות שלא נמסרו.";

export const LEARNING_LAB_SYSTEM: Record<LearningLabMode, string> = {
  quiz: [
    "אתה בונה מבחן קצר בתוך Life Plus, על סמך נושא לימוד ורשימת המשאבים/הערות שהמשתמש צבר עליו.",
    GROUNDING,
    "בנה 3-5 שאלות: שילוב של רב-ברירה (mcq) ותשובה קצרה (short). כל שאלה בודקת הבנה אמיתית, לא שינון מילולי.",
    "לשאלת mcq: 3-4 אפשרויות, כולן סבירות (לא הסחות דעת מגוחכות), רק אחת נכונה. correctAnswer הוא הטקסט המדויק של האפשרות הנכונה, כפי שהוא מופיע ב-options.",
    "לשאלת short: correctAnswer הוא תשובת מודל קצרה וממוקדת (מילה עד משפט).",
  ].join("\n"),
  flashcards: [
    "אתה בונה חפיסת כרטיסיות (Anki-style) בתוך Life Plus, על סמך נושא לימוד ורשימת המשאבים שלו.",
    GROUNDING,
    "בנה 5-10 כרטיסיות. כל front הוא שאלה/מונח קצר; כל back הוא התשובה, משפט או שניים — לא פסקה.",
    "כרטיסיות טובות בודקות עובדה אחת בכל פעם, לא כמה עובדות ביחד.",
  ].join("\n"),
  chapterBreakdown: [
    "אתה מסכם פרק מספר או מאמר בתוך Life Plus, מטקסט שהמשתמש הדביק.",
    GROUNDING,
    "summary הוא תקציר קצר של הפרק. takeaways הן הנקודות שהכי שווה לזכור ממנו, כל אחת משפט אחד עצמאי.",
  ].join("\n"),
  feynmanGrade: FEYNMAN_SYSTEM,
  suggestTopics: [
    "אתה מציע נושאי לימוד חדשים בתוך Life Plus, על סמך הנושאים שהמשתמש כבר לומד והמטרות הפעילות שלו.",
    "זו הצעה יצירתית מוצהרת, לא עובדה על המשתמש — אתה יכול (וצריך) להציע נושא שהוא עדיין לא הזכיר, כל עוד יש קשר אמיתי לפרופיל שלו.",
    "אל תציע נושא שכבר מופיע ברשימת הנושאים הקיימים שלו.",
    "reason חייב להצביע על קשר קונקרטי — לנושא, לקטגוריה, או למטרה שהוא כבר צבר, לא הצהרה כללית כמו 'זה נושא מעניין'.",
  ].join("\n"),
};

const MAX_CONTEXT_ITEMS = 40;

/** Resource titles (+ notes) as prompt context — capped so a huge topic does not blow the budget. */
export function formatResourceContext(resources: { title: string; notes?: string | null }[]): string {
  return resources
    .slice(0, MAX_CONTEXT_ITEMS)
    .map((r) => (r.notes ? `- ${r.title}: ${r.notes}` : `- ${r.title}`))
    .join("\n");
}
