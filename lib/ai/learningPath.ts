import "server-only";
import { z } from "zod";
import { generateStructuredData } from "@/lib/ai";
import type { AiActor } from "@/lib/ai/quota";

// Learning & Knowledge Space (Phase 7) AI Track Builder — shared by
// app/api/ai/learning-path (the standalone endpoint) and
// generateLearningPathAction (app/actions/learning.ts, which also persists
// the result into learning_resources). Kept as one module, same reasoning
// lib/ai/service.ts already gives for a single shared AI service: the logic
// only needs to exist once, called from two places for two different
// callers (an HTTP client vs. a Server Action that also writes to the DB).

export const learningPathSchema = z.object({
  summary: z.string().describe("סיכום קונספטואלי קצר של הנושא, 2-4 משפטים"),
  youtube_suggestions: z
    .array(z.string())
    .min(2)
    .max(6)
    .describe("מונחי חיפוש או שמות ערוצים מומלצים ב-YouTube ללימוד הנושא"),
  podcast_suggestions: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("רעיונות לפודקאסטים או פרקים רלוונטיים ללימוד הנושא"),
  quiz: z
    .array(
      z.object({
        question: z.string().describe("שאלה קצרה לבחינת הבנת הבסיס בנושא"),
        answer: z.string().describe("התשובה הנכונה לשאלה"),
      })
    )
    .length(3)
    .describe("בדיוק 3 שאלות בוחן לבדיקת הבנה בסיסית של הנושא"),
  equipment: z
    .array(z.string())
    .describe("כלים פיזיים או דיגיטליים הדרושים כדי להתחיל ללמוד את הנושא (תוכנה, ציוד, ספרים וכו')"),
});

export type LearningPath = z.infer<typeof learningPathSchema>;

export async function generateLearningPath(topic: string, actor: AiActor): Promise<LearningPath> {
  return generateStructuredData({
    actor: actor,
    schema: learningPathSchema,
    system:
      "אתה מורה פרטי מומחה שבונה מסלול למידה ראשוני לנושא שהמשתמש רוצה ללמוד — יכול להיות נושא טכני " +
      "(תכנות, מדעים) או ניתוח מעמיק של תוכן (ניתוח עלילה, לימוד לשוני וכו'). על סמך שם הנושא בלבד, הפק: " +
      "תקציר קונספטואלי קצר וברור; מונחי חיפוש או ערוצי YouTube מומלצים; רעיונות לפודקאסטים; בדיוק 3 שאלות " +
      "בוחן קצרות עם התשובה הנכונה לכל אחת; ורשימת כלים פיזיים או דיגיטליים הדרושים כדי להתחיל. ענה בעברית, " +
      "בצורה מעשית וממוקדת, ללא הקדמות מיותרות.",
    prompt: topic,
  });
}
