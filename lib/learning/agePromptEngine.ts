import type { TeachingMode, UserAgeGroup } from "@/types/learning";

// The Masterclass & Gaming OS's prompt builder: turns "this topic, this
// step, for this age group, in this teaching mode" into the system/user
// prompt pair app/api/learning/lesson/generate/route.ts hands to
// generateStructuredData(). Age group shapes the PERSONA (tone, vocabulary,
// what the analogies are drawn from); teaching mode shapes the STRUCTURE
// (how the material is organized). The two are orthogonal — a teenager can
// get a Socratic lesson, a kid can get one told as a story — so they're
// composed, not one combined table of twelve fixed variants.

export interface BuildLessonPromptParams {
  topicTitle: string;
  stepTitle: string;
  userAgeGroup: UserAgeGroup;
  teachingMode: TeachingMode;
  /** A specific angle the person wants emphasized ("תתמקד במתמטיקה", "תשמור את זה קצר"). */
  customEmphasis?: string;
}

export interface LessonPrompt {
  system: string;
  user: string;
}

const AGE_GROUP_DIRECTIVES: Record<UserAgeGroup, string> = {
  KIDS_8_12: `קהל היעד: ילדים בגילאי 8-12.
טון: סוחף במיוחד, חם, מלא דמיון ושובבות — כאילו חבר גדול ומגניב מספר סיפור, לא מורה שמעביר חומר.
אנלוגיות ודימויים: שאב השראה ממיינקראפט, פורטנייט, ספורט, גיבורי-על וסרטי אנימציה — עולם שהילד באמת מכיר ואוהב.
שפה: אוצר מילים פשוט, פסקאות קצרות וברורות, המון התלהבות וסימני קריאה במידה. עברית מנוקדת-ברמה (בלי ניקוד ממש, אבל פשוטה כזאת), RTL.`,
  TEENS_13_18: `קהל היעד: בני נוער בגילאי 13-18.
טון: קצבי, ישיר, מכוון-פרויקט, אמיתי — "בגובה העיניים", בלי להתנשא ובלי להתחנחן.
אנלוגיות ודימויים: עולם הסייבר, תרבות סטארט-אפים, גיימינג, והשפעה אמיתית של טכנולוגיה על החיים.
שפה: עברית עכשווית, חדה וברורה, עם נגיעות הומור — תוך שימת דגש על יישום מעשי ("איך זה עוזר לי *עכשיו*"), לא רק תיאוריה.`,
  ADULTS_19_PLUS: `קהל היעד: מבוגרים (19+).
טון: אינטלקטואלי, מובנה, מעמיק מבחינה קונספטואלית, יסודי מבחינה היסטורית.
דגש: מקורות ראשוניים, טרייד-אופים אדריכליים/עיצוביים, הקשר מקצועי רלוונטי, נרטיב ברמת פודקאסט איכותי — לא שטחי ולא מיתמם.
שפה: עברית עשירה ומדויקת, בלי לפשט יתר על המידה — הקורא מסוגל להתמודד עם מורכבות אמיתית.`,
};

const TEACHING_MODE_DIRECTIVES: Record<TeachingMode, string> = {
  STORYTELLING: `מבנה השיעור: דרמה כרונולוגית — התחל מנקודת המוצא ההיסטורית, בנה דמויות מרכזיות ונקודות מפנה, והוביל את הקורא דרך התפתחות הסיפור כמו עלילה, לא כרשימת עובדות.`,
  PRACTICAL: `מבנה השיעור: ישר לעניין — קוד, דוגמאות, שלבים אינטראקטיביים וביצוע בעולם האמיתי. מינימום הקדמה תיאורטית, מקסימום "בוא נבנה את זה ביחד".`,
  ANALOGIES: `מבנה השיעור: כל רעיון מופשט מקבל דימוי מהעולם הפיזי המוחשי — משהו שאפשר לגעת בו, לראות, להרגיש — לפני שחוזרים למושג המקורי.`,
  SOCRATIC: `מבנה השיעור: כל קטע נפתח בשאלה מאתגרת או ניסוי מחשבתי, והתוכן מתפתח כתשובה לשאלה הזו — הקורא "מגלה" את הרעיון, לא רק מקבל אותו.`,
};

const JSON_SCHEMA_REMINDER = `החזר אך ורק JSON תקין התואם במדויק את המבנה הבא (בלי טקסט לפני או אחרי, בלי markdown code fence מסביב לכל האובייקט):
{
  "originStory": string — סיפור דרמטי של איך התגלית/הנושא נולדו,
  "pioneers": [{ "id", "name", "role", "historicalEra", "bio", "famousQuote", "unusualFact", "externalLinks": [{ "title", "url", "type": "article"|"video"|"audio" }] }],
  "coreContent": string — הסבר מעמיק, בפורמט Markdown (מותר קוד/נוסחאות בתוך המחרוזת עצמה),
  "blooperOrDisaster": string — טעות היסטורית, באג, או תקלה מצחיקה שקשורה לנושא,
  "mindBlowingTrivia": string[],
  "memeData": { "imageUrl"?, "jokeText", "funnyQuizAnswers"? },
  "inAppMedia": { "youtubeVideoId"?, "videoChapters"?: [{ "time", "label" }], "audioSnippets"? },
  "inlineCheckpoints": [{ "id", "question", "options": [4 מחרוזות בדיוק], "correctIndex": 0-3, "explanation", "funnyDistractor"? }]
}
כל שדה טקסט הוא עברית טבעית ותקנית, כתובה כמחרוזת JSON רגילה — לעולם אל תשתיל בתוך מחרוזת JSON תג \`\`\` או markdown code fence; אם אתה כותב קוד בתוך coreContent, סמן אותו בתחביר Markdown רגיל (משתמע מתוך המחרוזת), לא בתגי code fence שעלולים לשבור את ה-JSON עצמו.
שדות של קישורים חיצוניים או מדיה (youtubeVideoId, imageUrl, audioSnippets, videoChapters, funnyQuizAnswers, funnyDistractor) הם שדות שיכולים להיות null — אל תמציא מזהה סרטון יוטיוב, קישור או תמונה רק כדי למלא את השדה. כלול אותם רק אם אתה בטוח לחלוטין שהם אמיתיים וידועים; אחרת החזר null בשדה (לא להשמיט אותו — הסכימה דורשת שהשדה יופיע, פשוט עם הערך null). קישור שבור גרוע יותר מחוסר קישור.`;

/** Builds the system/user prompt pair for one masterclass lesson block — the request generateStructuredData sends to the model. */
export function buildLessonPrompt(params: BuildLessonPromptParams): LessonPrompt {
  const system = `אתה כותב תוכן למחולל "Masterclass & Gaming OS" — שיעור אינטראקטיבי עשיר בתוך פלטפורמת למידה בשם Life Plus. אתה לא עונה למשתמש ולא מנהל שיחה; אתה מייצר תוכן שיעור שלם אחד, בעברית, לפי ההנחיות הבאות.

${AGE_GROUP_DIRECTIVES[params.userAgeGroup]}

${TEACHING_MODE_DIRECTIVES[params.teachingMode]}

${JSON_SCHEMA_REMINDER}`;

  const emphasis = params.customEmphasis ? `\nדגש מיוחד מבקשת המשתמש: ${params.customEmphasis}` : "";

  const user = `צור שיעור על הנושא "${params.topicTitle}", שלב: "${params.stepTitle}".${emphasis}`;

  return { system, user };
}
