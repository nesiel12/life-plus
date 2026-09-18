// Hebrew-language guards and formatting for מרחב תורה.
//
// THE RULE THIS MODULE EXISTS TO ENFORCE: every description, biography and
// note shown in the Torah space is Hebrew at the source. Provider text in
// another language is not translated — it is discarded, and the gap is filled
// by generating Hebrew natively (see app/api/torah/books/[id]/enrich and
// app/api/torah/rabbis/[id]/enrich). A translated English blurb reads like a
// translation; a sefer described from Torah knowledge in Hebrew reads like
// the beit midrash. So the check below is the gate every provider string
// passes through before it is stored.
//
// Pure and offline, so the gate itself is testable (hebrew.test.ts).

import { normalizeTerm } from "@/lib/torah/normalizeTerm";

const HEBREW_LETTER = /[\u05D0-\u05EA]/g;
const LATIN_LETTER = /[A-Za-z]/g;
// Scripts a Hebrew paragraph never legitimately contains. The lite models
// occasionally drift mid-sentence into a neighbouring script — an Arabic word
// inside otherwise fluent Hebrew was observed in real output (2026-09-17).
const FOREIGN_SCRIPT = /[\u0370-\u03FF\u0400-\u04FF\u0600-\u06FF\u0750-\u077F\u4E00-\u9FFF]/;
const FOREIGN_SCRIPT_GLOBAL = new RegExp(FOREIGN_SCRIPT.source, "g");

/**
 * Share of the letters in `text` that are Hebrew, 0..1.
 *
 * Counted against Hebrew, Latin and other-script letters. Digits and
 * punctuation do not count, the odd Latin acronym ("PDF") must not tip a
 * Hebrew paragraph into "not Hebrew", and a string with no letters at all has
 * no language.
 */
export function hebrewRatio(text: string): number {
  const hebrew = text.match(HEBREW_LETTER)?.length ?? 0;
  const foreign = (text.match(LATIN_LETTER)?.length ?? 0) + (text.match(FOREIGN_SCRIPT_GLOBAL)?.length ?? 0);
  const total = hebrew + foreign;
  return total === 0 ? 0 : hebrew / total;
}

/**
 * Removes words written in a script that has no place in Hebrew prose
 * (Arabic, Cyrillic, Greek, CJK), keeping line structure.
 *
 * Latin is deliberately NOT stripped — "PDF", a URL, a Sefaria ref are
 * legitimate inside Hebrew text; a stray Arabic word never is.
 */
export function stripForeignScript(text: string): string {
  if (!FOREIGN_SCRIPT.test(text)) return text;
  return text
    .split("\n")
    .map((line) =>
      line
        .split(/(\s+)/)
        .filter((token) => !FOREIGN_SCRIPT.test(token))
        .join("")
        .replace(/[ \t]{2,}/g, " ")
        .trim()
    )
    .join("\n");
}

/**
 * Hebrew abbreviation and numeral marks in their proper characters: gershayim
 * (״) inside a word — רמב״ם, נ״ט — and geresh (׳) closing one — ט׳, ר׳.
 *
 * Transcripts arrive with ASCII " and ', and an ASCII double quote inside
 * Hebrew text is a JSON string delimiter waiting to happen: a model asked to
 * quote "הרמב"ם" back in structured output cut the citation at the quote mark
 * (observed 2026-09-17). The Hebrew marks are also simply correct typography.
 */
export function normalizeHebrewPunctuation(text: string): string {
  return text
    .replace(/(?<=[\u05D0-\u05EA])["\u201C\u201D](?=[\u05D0-\u05EA])/g, "\u05F4")
    .replace(/(?<=[\u05D0-\u05EA])['\u2019](?=[\s,.:;)\]]|$)/g, "\u05F3");
}

/** Model-written Hebrew, cleaned of foreign-script drift, or undefined when not Hebrew. */
export function hebrewProse(value: string | null | undefined): string | undefined {
  return value ? hebrewOnly(stripForeignScript(value)) : undefined;
}

/**
 * Whether a string is Hebrew prose.
 *
 * 0.7 rather than 0.5: an English sentence quoting one Hebrew title can
 * approach half Hebrew letters by count, and that is exactly the text this
 * gate must reject.
 */
export function isHebrewText(text: string | null | undefined, threshold = 0.7): boolean {
  if (!text) return false;
  return hebrewRatio(text) >= threshold;
}

/** The trimmed value when it is Hebrew, otherwise undefined — never a translation. */
export function hebrewOnly(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && isHebrewText(trimmed) ? trimmed : undefined;
}

// ---------------------------------------------------------------------------
// Hebrew numerals
// ---------------------------------------------------------------------------

const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש"];

/**
 * 1..999 → Hebrew letters with geresh/gershayim ("תקצ״ט", "ט״ו", "ה׳").
 *
 * The inverse of hebrewNumeralToInt in citations.ts. 15 and 16 are written
 * ט״ו / ט״ז — never י״ה / י״ו, which spell a divine name.
 */
export function intToHebrewNumeral(value: number): string {
  let n = Math.floor(value);
  if (n <= 0 || n >= 1000) return String(value);

  let letters = "";
  while (n >= 400) {
    letters += "ת";
    n -= 400;
  }
  letters += HUNDREDS[Math.floor(n / 100)];
  n %= 100;

  if (n === 15) letters += "טו";
  else if (n === 16) letters += "טז";
  else letters += TENS[Math.floor(n / 10)] + ONES[n % 10];

  if (letters.length === 1) return `${letters}׳`;
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`;
}

/**
 * A Gregorian year as the Hebrew year label a Torah reader expects —
 * 1839 → "ה׳תקצ״ט".
 *
 * Approximate by one at the year boundary (Tishrei falls in the autumn), which
 * is the honest precision of a birth year recorded as a Gregorian number.
 * Years before the common era arrive negative from Sefaria, with no year 0.
 */
export function hebrewYearLabel(gregorianYear: number): string {
  const hebrewYear = gregorianYear > 0 ? gregorianYear + 3760 : gregorianYear + 3761;
  if (hebrewYear <= 0) return String(gregorianYear);
  const thousands = Math.floor(hebrewYear / 1000);
  const rest = hebrewYear % 1000;
  const prefix = thousands > 0 ? `${ONES[thousands] ?? ""}׳` : "";
  return rest === 0 ? prefix : `${prefix}${intToHebrewNumeral(rest)}`;
}

/** "ה׳תקצ״ט–ה׳תרצ״ג" with the Gregorian range, or whatever part is known. */
export function lifespanLabel(birthYear?: number, deathYear?: number): string | null {
  if (birthYear === undefined && deathYear === undefined) return null;
  const hebrew = [birthYear, deathYear].map((y) => (y === undefined ? "?" : hebrewYearLabel(y))).join("–");
  const gregorian = [birthYear, deathYear].map((y) => (y === undefined ? "?" : formatGregorian(y))).join("–");
  return `${hebrew} (${gregorian})`;
}

function formatGregorian(year: number): string {
  return year < 0 ? `${Math.abs(year)} לפנה״ס` : String(year);
}

// ---------------------------------------------------------------------------
// Eras
// ---------------------------------------------------------------------------

// Sefaria's era codes → the periodisation a Torah learner uses.
const ERA_LABELS: Record<string, string> = {
  PT: "תקופת בית שני",
  T: "תנאים",
  A: "אמוראים",
  S: "סבוראים",
  GN: "גאונים",
  RI: "ראשונים",
  AH: "אחרונים",
  CO: "בני זמננו",
};

/** A Sefaria era code as a Hebrew label; a label that is already Hebrew passes through. */
export function eraLabel(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return ERA_LABELS[trimmed.toUpperCase()] ?? hebrewOnly(trimmed);
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

// Titles and blessings that decorate a name without identifying anyone.
// "הרב קוק", "מרן הרב קוק זצ״ל" and "קוק" must find the same row. Listed in
// their folded form (normalizeTerm strips geresh/gershayim), so "זצ״ל",
// "זצ"ל" and "זצל" are one entry.
const HONORIFIC_PREFIXES = new Set(
  ["כ״ק", "האדמו״ר", "אדמו״ר", "הגאון", "הגה״צ", "מרן", "מורנו", "הרה״ג", "הרב", "רבי", "רבנו", "רבינו", "ר׳"].map(
    normalizeTerm
  )
);
const HONORIFIC_SUFFIXES = new Set(
  ["זצוק״ל", "זצ״ל", "זי״ע", "ז״ל", "שליט״א", "הי״ד", "נ״ע"].map(normalizeTerm)
);

/** The identifying part of a rabbi's name, folded for comparison. */
export function rabbiNameKey(name: string): string {
  let words = normalizeTerm(name).split(" ").filter(Boolean);
  // Never strip the last remaining word: a rabbi recorded only as "מרן" is
  // still someone, and an empty key would match every other empty key.
  while (words.length > 1 && HONORIFIC_PREFIXES.has(words[0])) words = words.slice(1);
  while (words.length > 1 && HONORIFIC_SUFFIXES.has(words[words.length - 1])) words = words.slice(0, -1);
  return words.join(" ");
}

export function sameRabbiName(a: string, b: string): boolean {
  const left = rabbiNameKey(a);
  return left.length > 0 && left === rabbiNameKey(b);
}

/** A book title folded for comparison; "ספר החינוך" and "החינוך" match. */
export function bookTitleKey(title: string): string {
  return normalizeTerm(title).replace(/^ספר /, "");
}

export function sameBookTitle(a: string, b: string): boolean {
  const left = bookTitleKey(a);
  return left.length > 0 && left === bookTitleKey(b);
}
