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
        kind: z
          .enum(["dilemma", "application", "counter", "scenario"])
          .describe(
            "dilemma = ספק תלמודי: מקרה עם שני צדדים שלכל אחד סברא, והלומד מכריע ומנמק; " +
              "application = יישום העיקרון על מקרה מעשי מהחיים שלא נזכר בשיעור; " +
              "counter = קושיא חזקה על מה שנלמד, שהלומד צריך להשיב עליה; " +
              "scenario = ״חבר שואל אותך…״ — הסבר לאחר"
          ),
        prompt: z
          .string()
          .describe("השאלה בעברית, חדה ומעוררת מחשבה — לעולם לא שאלת זיכרון"),
        modelAnswer: z.string().describe("תשובה מלאה ומנומקת בעברית, 3-6 משפטים, המבוססת על החלק שנלמד"),
        rubric: z
          .array(z.object({ criterion: z.string().describe("מה תשובה טובה חייבת לכלול, בעברית"), weight: z.number() }))
          .describe("2-4 קריטריונים לבדיקה, משקלים שסכומם 1"),
        difficulty: z.number().describe("1 (קל) עד 5 (קשה מאוד)"),
      })
    )
    .describe("3 שאלות: לפחות דילמה אחת וקושיא אחת, בקושי מדורג"),
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
  "אתה ראש ישיבה הבונה תרגול לחלק אחד של שיעור — תרגול שמחייב לחשוב, לא לזכור.",
  "סוגי השאלות:",
  "• דילמה תלמודית (dilemma): ספק שיש בו שני צדדים, ולכל צד סברא. בקש מהלומד להכריע ולנמק, ולציין מה הצד השני היה אומר.",
  "• יישום מעשי (application): מקרה אמיתי מהחיים — בבית, בעבודה, ברחוב — שבו העיקרון שנלמד מכריע.",
  "• קושיא (counter): הקשה בחריפות על מה שנלמד, כמו חברותא טובה, ובקש מהלומד לתרץ.",
  "• תרחיש (scenario): ״חבר שואל אותך…״ — הלומד מסביר את העיקר במילים שלו.",
  "כל שאלה חייבת להיות ניתנת לתשובה מתוך מה שנלמד בחלק הזה. אל תשאל על דברים שלא נאמרו.",
  "דרג את הקושי באמת: 1 = הבנת העיקר, 3 = החלה על מקרה חדש, 5 = הכרעה בספק קשה עם נימוק מלא.",
  "כתוב אך ורק בעברית מקורית. הכרטיסיות — קצרות, חדות, ובלי כפילויות.",
].join("\n");

/**
 * The "אתגר קשה יותר" round — offered once a learner averages 80+ on a part.
 * Only harder questions, no new flashcards.
 */
export const challengeQuestionsSchema = z.object({
  questions: z
    .array(chunkPracticeSchema.shape.questions.element)
    .describe("2 שאלות קשות (קושי 4-5): דילמה אחת וקושיא אחת, שונות מהשאלות שכבר נשאלו"),
});

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
