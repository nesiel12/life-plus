// A curated list of widely-learned seforim, by their Hebrew names.
//
// Two jobs, both about making the Torah space connected before the user has
// built much of a library:
//
//   1. Auto-linking in personal notes (lib/torah/autoLink.ts). Writing
//      "כמו שכתוב בשולחן ערוך" should link to the Shulchan Aruch's page even
//      when it is not on the shelf yet — following the link is what adds it.
//   2. Quick picks in the empty state of the search command center.
//
// Deliberately conservative. Every entry is a distinctive, multi-word (or
// unmistakable single-word) title: generic words that also name a sefer —
// "משנה", "זוהר", "תורה" — are left out, because auto-linking every
// occurrence of the word "תורה" in a note would bury the links that matter.

export interface CatalogSefer {
  /** The Hebrew title as it is usually written. */
  title: string;
  /** Other common spellings and abbreviations that should match. */
  aliases?: string[];
  /** A short Hebrew category label for the command center. */
  category: string;
}

export const SEFORIM_CATALOG: CatalogSefer[] = [
  // הלכה
  { title: "שולחן ערוך", aliases: ["שו״ע", "השולחן ערוך"], category: "הלכה" },
  { title: "משנה ברורה", aliases: ["משנ״ב"], category: "הלכה" },
  { title: "קיצור שולחן ערוך", category: "הלכה" },
  { title: "ערוך השולחן", category: "הלכה" },
  { title: "משנה תורה", aliases: ["יד החזקה"], category: "הלכה" },
  { title: "ארבעה טורים", aliases: ["הטור"], category: "הלכה" },
  { title: "בית יוסף", category: "הלכה" },
  { title: "חיי אדם", category: "הלכה" },
  { title: "כף החיים", category: "הלכה" },
  { title: "בן איש חי", category: "הלכה" },
  { title: "ילקוט יוסף", category: "הלכה" },
  { title: "פניני הלכה", category: "הלכה" },
  { title: "שמירת שבת כהלכתה", category: "הלכה" },
  { title: "ספר החינוך", category: "הלכה" },
  { title: "ספר המצוות", category: "הלכה" },
  { title: "חפץ חיים", category: "הלכה" },
  { title: "שמירת הלשון", category: "מוסר" },
  { title: "אגרות משה", category: "שו״ת" },
  { title: "יביע אומר", category: "שו״ת" },
  { title: "חזון איש", category: "הלכה" },

  // מוסר וחסידות
  { title: "מסילת ישרים", category: "מוסר" },
  { title: "חובות הלבבות", category: "מוסר" },
  { title: "שערי תשובה", category: "מוסר" },
  { title: "אורחות צדיקים", category: "מוסר" },
  { title: "מכתב מאליהו", category: "מוסר" },
  { title: "עלי שור", category: "מוסר" },
  { title: "נפש החיים", category: "מחשבה" },
  { title: "ליקוטי אמרים", aliases: ["התניא", "ספר התניא"], category: "חסידות" },
  { title: "ליקוטי מוהר״ן", category: "חסידות" },
  { title: "נתיבות שלום", category: "חסידות" },
  { title: "שפת אמת", category: "חסידות" },
  { title: "נועם אלימלך", category: "חסידות" },
  { title: "קדושת לוי", category: "חסידות" },
  { title: "מאור עיניים", category: "חסידות" },
  { title: "שם משמואל", category: "חסידות" },

  // מחשבה
  { title: "הכוזרי", aliases: ["ספר הכוזרי"], category: "מחשבה" },
  { title: "מורה נבוכים", category: "מחשבה" },
  { title: "דרך ה׳", aliases: ["דרך השם"], category: "מחשבה" },
  { title: "דעת תבונות", category: "מחשבה" },
  { title: "אורות הקודש", category: "מחשבה" },
  { title: "אורות התשובה", category: "מחשבה" },
  { title: "עין איה", category: "מחשבה" },
  { title: "שמונה קבצים", category: "מחשבה" },
  { title: "אמונה ובטחון", category: "מחשבה" },
  { title: "שיחות הר״ן", category: "חסידות" },

  // תנ״ך ומפרשים
  { title: "מקראות גדולות", category: "תנ״ך" },
  { title: "אור החיים", aliases: ["אור החיים הקדוש"], category: "תנ״ך" },
  { title: "העמק דבר", category: "תנ״ך" },
  { title: "משך חכמה", category: "תנ״ך" },
  { title: "כלי יקר", category: "תנ״ך" },
  { title: "מלבי״ם", category: "תנ״ך" },
  { title: "מצודת דוד", category: "תנ״ך" },

  // תלמוד ומדרש
  { title: "תלמוד בבלי", aliases: ["הש״ס", "ש״ס בבלי"], category: "תלמוד" },
  { title: "תלמוד ירושלמי", category: "תלמוד" },
  { title: "פרקי אבות", aliases: ["מסכת אבות"], category: "משנה" },
  { title: "עין יעקב", category: "אגדה" },
  { title: "מדרש רבה", category: "מדרש" },
  { title: "מדרש תנחומא", category: "מדרש" },
  { title: "ילקוט שמעוני", category: "מדרש" },
  { title: "קצות החושן", category: "למדנות" },
  { title: "שערי יושר", category: "למדנות" },
  { title: "חידושי רבי חיים הלוי", category: "למדנות" },
];
