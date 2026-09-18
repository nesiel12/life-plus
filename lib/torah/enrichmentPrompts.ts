import { z } from "zod";

// The model-facing half of Torah enrichment: the structured-output schemas and
// the system prompts for the book and rabbi enrich routes
// (app/api/torah/books/[id]/enrich, app/api/torah/rabbis/[id]/enrich).
//
// Kept out of the route files so they can be exercised directly against the
// live provider, and so the Hebrew-first wording lives in one reviewable
// place.

// ---------------------------------------------------------------------------
// Books
// ---------------------------------------------------------------------------

// Empty strings rather than optional fields: structured output from every
// provider handles "" reliably, and hebrewOnly() turns it into "absent".
export const bookEnrichmentSchema = z.object({
  description: z
    .string()
    .describe(
      "3-5 משפטים בעברית תורנית עשירה: מהו הספר, מי חיבר אותו ובאיזו תקופה, במה הוא עוסק, ומה מקומו בעולם התורה"
    ),
  preStudyNotes: z
    .string()
    .describe(
      "3-5 שורות קצרות בעברית, כל אחת בשורה נפרדת: מה חשוב לדעת לפני שמתחילים ללמוד — מבנה הספר, הרקע הנדרש, סדר לימוד מומלץ, ומפרשים מרכזיים"
    ),
  keyTopics: z.array(z.string()).describe("4-8 נושאים מרכזיים בספר, כל אחד 1-4 מילים בעברית"),
  author: z.string().describe("שם המחבר בעברית כפי שהוא מוכר בעולם התורה, או מחרוזת ריקה אם אינו ידוע בוודאות"),
  category: z.string().describe("קטגוריה אחת בעברית: הלכה / מוסר / חסידות / מחשבה / תנ״ך / תלמוד / מדרש / קבלה / שו״ת / תפילה"),
  hebrewTitle: z.string().describe("שם הספר בעברית כפי שהוא נכתב בדרך כלל"),
});

// Written in Hebrew on purpose. A Hebrew instruction produces Hebrew that
// reads as written, not as rendered from English; the explicit "not a
// translation" line is the part that matters most.
export const BOOK_ENRICHMENT_SYSTEM_PROMPT = [
  "אתה תלמיד חכם וכותב ספרות תורנית, הכותב תיאורים לספרי קודש עבור אפליקציית לימוד אישית.",
  "כתוב אך ורק בעברית מקורית, עשירה וטבעית — בלשון בית המדרש. לעולם אל תתרגם מאנגלית ואל תשתמש במונחים לועזיים.",
  "כתוב מתוך הידע התורני שלך על הספר עצמו. אל תמציא עובדות, תאריכים או תוכן שאינך בטוח בהם; כשאינך בטוח — כתוב באופן כללי.",
  "כשניתן לך 'מידע מספריא', הוא עובדתי: התבסס עליו והרחב, ואל תסתור אותו.",
].join("\n");

// ---------------------------------------------------------------------------
// Rabbis
// ---------------------------------------------------------------------------

// A model's confidence is capped below a record's. Even a 100%-sure guess is
// a guess, and the profile must be able to tell it apart from what Sefaria
// actually recorded.
export const AI_CONFIDENCE_CAP = 0.9;

const personSchema = z.object({
  name: z.string().describe("שם בעברית כפי שהוא מוכר"),
  confidence: z.number().describe("0 עד 1 — עד כמה אתה בטוח בקשר הזה"),
});

// "" and 0 stand for "unknown" — structured output handles them far more
// reliably than optional fields across providers.
export const rabbiProfileSchema = z.object({
  hebrewName: z.string().describe("השם המלא בעברית כפי שהוא מוכר בעולם התורה, כולל כינויו הידוע"),
  title: z.string().describe("תפקידו בקצרה בעברית, למשל: ראש ישיבת ראדין, רבה של ירושלים, פוסק הדור"),
  bio: z
    .string()
    .describe("סיפור חייו בעברית תורנית עשירה: 2-4 פסקאות, מופרדות בשורה ריקה — ילדותו, לימודיו, דרכו, פועלו ופטירתו"),
  historicalContext: z
    .string()
    .describe("פסקה 1-2 בעברית: התקופה, הקהילה והעולם התורני שבו חי, ומה ייחד את דרכו בתוכו"),
  achievements: z.array(z.string()).describe("3-6 הישגים מרכזיים, כל אחד משפט קצר בעברית"),
  era: z.string().describe("התקופה בעברית: תנאים / אמוראים / גאונים / ראשונים / אחרונים / בני זמננו"),
  isContemporary: z.boolean().describe("true אם הוא רב בן זמננו (חי במאה ה-20 המאוחרת או ה-21)"),
  birthYear: z.number().describe("שנת לידה לועזית, או 0 אם אינה ידועה בוודאות"),
  deathYear: z.number().describe("שנת פטירה לועזית, או 0 אם אינה ידועה או שהוא בחיים"),
  birthPlace: z.string().describe("מקום לידתו בעברית, או מחרוזת ריקה"),
  deathPlace: z.string().describe("מקום פטירתו בעברית, או מחרוזת ריקה"),
  locations: z
    .array(
      z.object({
        place: z.string().describe("שם המקום בעברית"),
        fromYear: z.number().describe("שנה לועזית, או 0"),
        toYear: z.number().describe("שנה לועזית, או 0"),
        note: z.string().describe("מה עשה שם, בקצרה בעברית"),
      })
    )
    .describe("תחנות חייו לפי הסדר, עד 6"),
  teachers: z.array(personSchema).describe("רבותיו המובהקים, עד 6"),
  students: z.array(personSchema).describe("תלמידיו הבולטים, עד 8"),
  works: z
    .array(
      z.object({
        title: z.string().describe("שם הספר בעברית"),
        description: z.string().describe("משפט אחד בעברית על הספר"),
        year: z.number().describe("שנת חיבור או הדפסה לועזית, או 0"),
        confidence: z.number().describe("0 עד 1"),
      })
    )
    .describe("ספריו וחיבוריו העיקריים, עד 12"),
  websiteUrl: z.string().describe("כתובת האתר הרשמי רק אם אתה בטוח בה לחלוטין, אחרת מחרוזת ריקה"),
  youtubeChannelUrl: z.string().describe("כתובת ערוץ היוטיוב הרשמי רק אם אתה בטוח בה לחלוטין, אחרת מחרוזת ריקה"),
});

export const RABBI_PROFILE_SYSTEM_PROMPT = [
  "אתה היסטוריון של עולם התורה ותלמיד חכם, הכותב פרופילים של רבנים וגדולי ישראל עבור אפליקציית לימוד אישית.",
  "כתוב אך ורק בעברית מקורית, עשירה ומכובדת — בלשון ספרי תולדות גדולי ישראל. לעולם אל תתרגם מאנגלית.",
  "דייק. אל תמציא תאריכים, מקומות, רבותיו, תלמידיו או ספרים. מה שאינך בטוח בו — השמט, או כתוב באופן כללי.",
  "כשניתנים לך 'נתונים מספריא', הם עובדתיים: התבסס עליהם, הרחב בזהירות, ואל תסתור אותם.",
  "לעולם אל תמציא מספרי טלפון, קבוצות וואטסאפ או כתובות אתרים.",
].join("\n");
