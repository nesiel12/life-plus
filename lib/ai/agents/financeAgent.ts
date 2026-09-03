import { z } from "zod";
import { EXPENSE_KEYS, INCOME_KEYS } from "@/lib/finances/categories";

// FinanceAgent — the Personal CFO.
//
// Division of labour that shapes everything here: all arithmetic lives in
// lib/finances/analyze.ts and is handed to the model as settled fact. The model
// never computes a total, a delta or a rate. An LLM asked for a savings rate
// produces a confident, subtly wrong number, and in a finance feature a
// plausible wrong number is more dangerous than no number. Interpretation in
// Hebrew is the part it is genuinely good at, so that is all it is asked for.

export const categorizationSchema = z.object({
  assignments: z
    .array(
      z.object({
        index: z.number().int().min(0).describe("מיקום התנועה ברשימה שנשלחה"),
        category: z.string().describe("מפתח קטגוריה מהרשימה הסגורה בלבד"),
      })
    )
    .describe("סיווג לכל תנועה שנשלחה"),
});

export const cfoAnalysisSchema = z.object({
  headline: z.string().max(120).describe("משפט אחד: איך החודש נראה"),
  standing: z
    .enum(["strong", "steady", "tight", "concerning"])
    .describe("המצב הפיננסי החודש ביחס לחודשים הקודמים"),
  observations: z
    .array(z.string())
    .min(1)
    .max(4)
    .describe("תובנות קונקרטיות שמתייחסות למספרים שנמסרו, לא עצות כלליות"),
  recommendations: z
    .array(z.string())
    .max(3)
    .describe("המלצות מעשיות לחיסכון. ריק אם אין המלצה כנה להציע"),
});

export type CategorizationResult = z.infer<typeof categorizationSchema>;
export type CfoAnalysis = z.infer<typeof cfoAnalysisSchema>;

export const CATEGORIZATION_SYSTEM = [
  "אתה מסווג תנועות בנק לקטגוריות עבור Life Plus.",
  "",
  "כללים:",
  "- בחר אך ורק מפתח מתוך הרשימה הסגורה שנמסרה לך. אל תמציא מפתחות חדשים.",
  "- לכל תנועה שנשלחה החזר בדיוק שיבוץ אחד, עם ה-index המקורי שלה.",
  "- הוצאה מסווגת לקטגוריית הוצאה, הכנסה לקטגוריית הכנסה.",
  "- אם באמת לא ברור, השתמש ב-other (הוצאה) או other_income (הכנסה). זה עדיף על ניחוש שגוי.",
  `- קטגוריות הוצאה: ${EXPENSE_KEYS.join(", ")}`,
  `- קטגוריות הכנסה: ${INCOME_KEYS.join(", ")}`,
].join("\n");

export const CFO_SYSTEM = [
  "אתה ה-CFO האישי של המשתמש ב-Life Plus. אתה מדבר עברית טבעית, ישירה ומכבדת.",
  "",
  "כללים קשיחים:",
  "- כל המספרים כבר חושבו ונמסרו לך. אל תחשב מספרים בעצמך ואל תמציא נתונים.",
  "- התייחס למספרים הספציפיים שנמסרו, לא לעצות כלליות שמתאימות לכל אחד.",
  "- אל תבהיל ואל תשבח יתר על המידה. אם החודש פשוט סביר, אמור שהוא סביר.",
  "- אם אין מספיק היסטוריה כדי להשוות, אמור זאת במפורש במקום להמציא מגמה.",
  "- אל תיתן ייעוץ השקעות. אתה לא יועץ מורשה.",
  "- המלצות רק אם יש משהו אמיתי להציע. רשימה ריקה עדיפה על מילוי מכסה.",
].join("\n");
