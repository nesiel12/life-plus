import { z } from "zod";

// The model-facing half of the lessons pipeline and "לתרגל": schemas and
// Hebrew system prompts for lesson analysis, practice generation and grading.
//
// Hebrew prompts, Hebrew output — the same native-Hebrew rule as the Book and
// Rabbi pages (lib/torah/enrichmentPrompts.ts). "" and 0 stand for unknown:
// structured output from every provider handles them more reliably than
// optional fields.

// ---------------------------------------------------------------------------
// Lesson analysis
// ---------------------------------------------------------------------------

export const lessonAnalysisSchema = z.object({
  summary: z
    .string()
    .describe("סיכום מפורט של השיעור בעברית: 3-5 פסקאות מופרדות בשורה ריקה — השאלה, מהלך הדברים, הראיות והמסקנות"),
  keyPoints: z.array(z.string()).describe("5-8 נקודות מרכזיות שכדאי לזכור, כל אחת משפט אחד בעברית"),
  chapters: z
    .array(
      z.object({
        start: z.string().describe("זמן ההתחלה של הפרק, מתוך חותמות הזמן בתמלול, בפורמט MM:SS או HH:MM:SS"),
        title: z.string().describe("כותרת קצרה (2-6 מילים) בעברית"),
        summary: z.string().describe("משפט אחד בעברית: מה נלמד בפרק"),
      })
    )
    .describe("חלוקת השיעור לפרקים לפי מעברי נושא אמיתיים, לפי סדר הזמנים. 3-12 פרקים"),
  citations: z
    .array(
      z.object({
        quote: z.string().describe("המקור כפי שהמרצה הזכיר אותו, מילה במילה מתוך התמלול"),
        reference: z
          .string()
          .describe("מראה המקום המדויק בכתיב תורני מלא, כולל שם הספר (למשל: בבא מציעא נ״ט ע״ב, בראשית פרק א פסוק א, שולחן ערוך אורח חיים סימן רה)"),
        at: z.string().describe("חותמת הזמן של השורה שבה הוזכר, בפורמט MM:SS"),
        kind: z.enum(["verse", "talmud", "halacha", "book", "other"]),
        confidence: z.number().describe("0 עד 1 — עד כמה ברור מהתמלול שזה המקור"),
      })
    )
    .describe("כל פסוק, גמרא, הלכה או ספר שצוטט או הוזכר במפורש. רשימה ריקה אם אין"),
});

export const LESSON_ANALYSIS_SYSTEM_PROMPT = [
  "אתה תלמיד חכם המנתח תמלול של שיעור תורה עבור אפליקציית לימוד אישית.",
  "כתוב אך ורק בעברית מקורית ועשירה, בלשון בית המדרש. לעולם אל תתרגם מאנגלית.",
  "התבסס אך ורק על מה שנאמר בתמלול. אל תוסיף מקורות, טענות או דוגמאות שלא נאמרו.",
  "חותמות הזמן בפרקים ובמקורות חייבות להיות מתוך חותמות הזמן שבתמלול עצמו.",
  "התמלול נוצר אוטומטית ועלול להכיל שגיאות כתיב — פרש אותן לפי ההקשר התורני, אבל אל תמציא.",
].join("\n");

// ---------------------------------------------------------------------------
// Practice generation — one learning chunk at a time
// ---------------------------------------------------------------------------

export const chunkPracticeSchema = z.object({
  questions: z
    .array(
      z.object({
        kind: z.enum(["scenario", "application", "compare"]),
        prompt: z
          .string()
          .describe("שאלה מעמיקה בעברית: תרחיש מציאותי, יישום העיקרון על מקרה חדש, או השוואה בין שיטות — לא שאלת זיכרון"),
        modelAnswer: z.string().describe("תשובה מלאה ומנומקת בעברית, 3-6 משפטים, המבוססת על החלק שנלמד"),
        rubric: z
          .array(z.object({ criterion: z.string().describe("מה תשובה טובה חייבת לכלול, בעברית"), weight: z.number() }))
          .describe("2-4 קריטריונים לבדיקה, משקלים שסכומם 1"),
        difficulty: z.number().describe("1 (קל) עד 5 (קשה מאוד)"),
      })
    )
    .describe("3 שאלות, מגוונות בסוגן ובקושי"),
  flashcards: z
    .array(
      z.object({
        front: z.string().describe("צד השאלה: מושג, שאלה ממוקדת או מקור — בעברית, קצר"),
        back: z.string().describe("צד התשובה: תשובה מדויקת וקצרה בעברית, 1-2 משפטים"),
      })
    )
    .describe("4-6 כרטיסיות לחזרה מרווחת על העיקר שבחלק הזה"),
});

export const CHUNK_PRACTICE_SYSTEM_PROMPT = [
  "אתה מלמד תורה מנוסה הבונה תרגול לחלק אחד של שיעור.",
  "המטרה היא הבנה עמוקה, לא שינון: שאלות תרחיש (״חבר שואל אותך…״), יישום עיקרון על מקרה שלא נזכר בשיעור, והשוואה בין דעות או סברות.",
  "כל שאלה חייבת להיות ניתנת לתשובה מתוך מה שנלמד בחלק הזה. אל תשאל על דברים שלא נאמרו.",
  "כתוב אך ורק בעברית מקורית. הכרטיסיות — קצרות, חדות, ובלי כפילויות.",
].join("\n");

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export const gradingSchema = z.object({
  score: z.number().describe("ציון 0 עד 100 לפי הקריטריונים ומשקליהם"),
  feedback: z
    .string()
    .describe("משוב בעברית, 2-4 משפטים, בגוף שני: מה היה טוב, מה חסר, ואיך לחדד — בנימה מעודדת ומדויקת"),
  rubric: z
    .array(z.object({ criterion: z.string(), met: z.boolean(), note: z.string().describe("הערה קצרה בעברית") }))
    .describe("לכל קריטריון: האם התשובה עמדה בו"),
});

export const GRADING_SYSTEM_PROMPT = [
  "אתה בודק תשובה של לומד לשאלת תרגול בשיעור תורה, כחברותא רצינית ומעודדת.",
  "בדוק לפי הקריטריונים והתשובה המנומקת. תשובה נכונה בניסוח אחר — נכונה. אל תעניש על סגנון או כתיב.",
  "אם התשובה ריקה או לא קשורה — ציון נמוך והסבר קצר. כתוב אך ורק בעברית.",
].join("\n");
