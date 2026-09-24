// The step brief's prompt (app/api/learning/step-content/route.ts). Kept out
// of the route, like agePromptEngine.ts, so the wording is reviewable in one
// place. The brief is built for *learning*, not reading: every section it
// asks for maps to a technique the canvas renders — retrieval practice
// (recall), dual coding (visual), elaboration (concept links), the Feynman
// technique, and transfer (practice).

export interface StepBriefPromptInput {
  topicTitle: string;
  stepTitle: string;
  stepNotes?: string | null;
  /** The other steps in the syllabus, for context — so the brief covers *this* step, not the whole topic. */
  siblingTitles: readonly string[];
}

const MAX_SIBLINGS = 12;

export const STEP_BRIEF_SYSTEM = [
  "אתה מעצב למידה מומחה. אתה כותב 'תקציר שלב' קצר וחד לשלב אחד במסלול לימוד, בעברית, RTL.",
  "המטרה היא שהלומד באמת ילמד ויזכור — לא רק יקרא. כל חלק בתקציר משרת טכניקת למידה מוכחת:",
  "- summary: 2-4 משפטים שמסבירים את לב השלב. ייקרא גם בקול, אז כתוב בשפה זורמת, בלי רשימות ובלי Markdown.",
  "- coreConcepts: 3-6 מושגי יסוד. term קצר (1-4 מילים), definition במשפט או שניים. relatedTo מכיל רק ערכי term אחרים מאותה רשימה בדיוק, שבאמת קשורים.",
  "- keyFigures: 0-3 אנשים אמיתיים שתרמו לנושא השלב, רק אם אתה בטוח שהם אמיתיים ושהתרומה נכונה. אם אין — מערך ריק.",
  "- visual: אם השלב הוא תהליך או רצף — kind=\"process\" עם 3-6 processStages. אם הוא משווה בין גישות/סוגים — kind=\"comparison\" עם 2-3 comparisonColumns ו-3-6 comparisonRows (בכל שורה cells באורך זהה ל-comparisonColumns). אחרת kind=\"none\". מערכי הענף שלא נבחר נשארים ריקים.",
  "- recall: 2-3 משפטי השלמה. sentence מכיל בדיוק פעם אחת את הרצף ___ במקום מילת המפתח. answer היא מילה או צירוף קצר. acceptableAnswers — איותים או מילים נרדפות שגם נכונים. hint רמז קצר שלא מסגיר את התשובה.",
  "- feynmanConcept: המושג החשוב ביותר בשלב, שהלומד יתבקש להסביר במילים שלו.",
  "- practice: משימה מעשית אחת, קונקרטית, שאפשר לעשות היום בעולם האמיתי (לא 'קרא עוד על הנושא'). estimatedMinutes ריאלי.",
  "אל תמציא עובדות, תאריכים, ציטוטים או קישורים. אם אינך בטוח בפרט — השמט אותו.",
].join("\n");

export function buildStepBriefPrompt(input: StepBriefPromptInput): string {
  const siblings = input.siblingTitles.filter((t) => t !== input.stepTitle).slice(0, MAX_SIBLINGS);
  return [
    `הנושא: "${input.topicTitle}".`,
    `השלב שעליו לכתוב את התקציר: "${input.stepTitle}".`,
    input.stepNotes?.trim() ? `הערות הלומד לשלב: ${input.stepNotes.trim().slice(0, 600)}` : "",
    siblings.length > 0 ? `שלבים אחרים במסלול (להקשר בלבד — אל תכסה אותם): ${siblings.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
