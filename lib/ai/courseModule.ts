import "server-only";
import { z } from "zod";
import { generateStructuredData } from "@/lib/ai";

// Deep course modules for the Learning Hub.
//
// This replaces the thin output of lib/ai/learningPath.ts for the *study*
// experience: that module's `summary` is specified as "2-4 sentences", which
// is fine as a topic blurb and useless as something to actually learn from.
//
// The schema below is where the depth is enforced. Asking a model for
// "comprehensive material" in the prompt and leaving the shape loose reliably
// produces three bullet points; giving each section a minimum body length and
// requiring several sections makes short output a schema violation the model
// has to fix rather than a stylistic preference it can ignore.
//
// Honesty constraint, same as every other agent here: no web access is wired
// into generateStructuredData, so the persona is told to teach from general
// knowledge and never to cite a specific source, statistic, or study it
// cannot actually verify. A confidently invented citation in study material
// is worse than a plainer explanation, because the learner has no way to
// catch it.

const MIN_SECTION_CHARS = 400;

export const courseModuleSchema = z.object({
  title: z.string().describe("כותרת המודול, קצרה ותיאורית"),
  intro: z.string().min(150).describe("פסקת פתיחה שמסבירה למה הנושא הזה חשוב ומה הלומד ידע בסופו"),
  sections: z
    .array(
      z.object({
        heading: z.string().describe("כותרת התת-נושא"),
        body: z
          .string()
          .min(MIN_SECTION_CHARS)
          .describe(
            "הסבר מעמיק ומלא בעברית, לפחות שתי פסקאות ממשיות. הסבר מושגים מהיסוד, עם דוגמאות קונקרטיות. " +
              "אל תכתוב רשימת נקודות — כתוב טקסט מוסבר וזורם."
          ),
      })
    )
    .min(3)
    .max(6)
    .describe("3-6 תת-נושאים, כל אחד עם הסבר מעמיק"),
  keyTakeaways: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe("הנקודות המרכזיות לזכור, כל אחת משפט שלם"),
  quiz: z
    .array(
      z.object({
        question: z.string().describe("שאלה שבודקת הבנה, לא שינון"),
        options: z.array(z.string()).length(4).describe("בדיוק 4 אפשרויות, כולן סבירות למי שלא הבין"),
        correctIndex: z.number().int().min(0).max(3).describe("האינדקס של התשובה הנכונה ב-options"),
        explanation: z.string().describe("הסבר קצר למה זו התשובה הנכונה"),
      })
    )
    .min(3)
    .max(5)
    .describe("3-5 שאלות רב-ברירה עם ניקוד מיידי"),
});

export type CourseModule = z.infer<typeof courseModuleSchema>;
export type QuizQuestion = CourseModule["quiz"][number];

const SYSTEM = [
  "אתה מורה מומחה שכותב חומר לימוד מעמיק בעברית ל-Life Plus.",
  "",
  "כללים:",
  "- כתוב חומר לימוד אמיתי ומלא, לא תקציר. כל תת-נושא צריך לפחות שתי פסקאות ממשיות שמסבירות את הרעיון מהיסוד.",
  "- הסבר מושגים במילים פשוטות, עם דוגמאות קונקרטיות. הנח שהקורא מתחיל אבל חכם.",
  "- אל תכתוב רשימות נקודות בגוף ההסבר — טקסט זורם ומוסבר.",
  "- אין לך גישה לאינטרנט. אל תצטט מקור, מחקר, סטטיסטיקה או תאריך ספציפי שאתה לא בטוח בו לחלוטין. עדיף הסבר כללי ונכון מאשר פרט מומצא שנשמע מדויק.",
  "- שאלות הבוחן צריכות לבדוק הבנה, לא זיכרון. כל ארבע האפשרויות צריכות להיראות סבירות למי שלא הבין את החומר.",
].join("\n");

export async function generateCourseModule(topic: string, focus?: string): Promise<CourseModule> {
  const prompt = focus?.trim()
    ? `הנושא: ${topic}\nהתמקד במיוחד ב: ${focus.trim()}`
    : `הנושא: ${topic}`;
  return generateStructuredData({ schema: courseModuleSchema, system: SYSTEM, prompt });
}
