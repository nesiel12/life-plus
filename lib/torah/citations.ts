// Parsing and normalising Torah citations — the deterministic half of the
// Sources Panel.
//
// The model's job is to spot that a speaker said something like "כמו שכתוב
// בבבא מציעא נ״ט ע״ב"; this module's job is to turn that phrase into a
// canonical reference that can actually be fetched. That split is on purpose.
// Asking an LLM to emit "Bava Metzia 59b" directly gets a format that is
// right most of the time and silently wrong the rest — a hallucinated daf is
// indistinguishable from a real one until someone opens it. Gematria is
// arithmetic, and arithmetic should not be guessed.
//
// Everything here is pure and offline. Nothing in this file calls Sefaria;
// it only produces the ref string that lib/torah/sources/sefaria.ts fetches.

const GERESH_PATTERN = /[׳״'"`]/g;

// Hebrew letter values, final forms included. Finals carry the same value as
// their base letter — ך is 20 exactly like כ — which is what makes a plain
// sum work for every number Torah citations actually use.
const LETTER_VALUES: Record<string, number> = {
  א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9,
  י: 10, כ: 20, ך: 20, ל: 30, מ: 40, ם: 40, נ: 50, ן: 50,
  ס: 60, ע: 70, פ: 80, ף: 80, צ: 90, ץ: 90,
  ק: 100, ר: 200, ש: 300, ת: 400,
};

/**
 * Gematria → integer.
 *
 * Summed, not positional. That handles the two cases a positional reader
 * gets wrong: ט״ו is 15 and ט״ז is 16 (written that way to avoid spelling a
 * divine name, so they are *not* י+ה and י+ו), and ת״ר style repetition
 * (ת+ר = 600) needs no special case either.
 *
 * Returns null for anything that is not purely Hebrew letters, so a caller
 * can tell "this was not a number" from "this was zero".
 */
export function hebrewNumeralToInt(input: string): number | null {
  const letters = input.replace(GERESH_PATTERN, "").trim();
  if (!letters) return null;

  let total = 0;
  for (const char of letters) {
    const value = LETTER_VALUES[char];
    if (value === undefined) return null;
    total += value;
  }

  return total > 0 ? total : null;
}

const FINAL_TO_BASE: Record<string, string> = { ך: "כ", ם: "מ", ן: "נ", ף: "פ", ץ: "צ" };
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const HUNDREDS = ["", "ק", "ר", "ש"];

function canonicalLetters(value: number): string {
  let n = value;
  let letters = "";
  while (n >= 400) {
    letters += "ת";
    n -= 400;
  }
  letters += HUNDREDS[Math.floor(n / 100)];
  n %= 100;
  if (n === 15) return `${letters}טו`;
  if (n === 16) return `${letters}טז`;
  return letters + TENS[Math.floor(n / 10)] + ONES[n % 10];
}

/**
 * Whether a token is a number AS A PERSON WRITES ONE — digits, or Hebrew
 * letters in descending order ("נט", "רה", "טו").
 *
 * The guard that separates numbers from words. Any short Hebrew word has a
 * gematria value, so without it "בבא מציעא דף נ״ט" parsed "דף" as daf 84 and
 * "רבי יהושע על רגליו" parsed as the book of Joshua, chapter "על" (100) —
 * both observed in real transcripts. A numeral is always written canonically;
 * a word almost never is.
 */
export function isCanonicalNumeral(token: string): boolean {
  const trimmed = token.trim();
  if (/^\d+$/.test(trimmed)) return true;
  const letters = trimmed.replace(GERESH_PATTERN, "").replace(/[ךםןףץ]/g, (c) => FINAL_TO_BASE[c]);
  const value = hebrewNumeralToInt(letters);
  return value !== null && value < 1000 && canonicalLetters(value) === letters;
}

/** Accepts either a Hebrew numeral or plain digits, as speakers use both. */
export function parseNumber(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  return hebrewNumeralToInt(trimmed);
}

export type CitationKind = "verse" | "talmud" | "halacha" | "book" | "other";

export interface ParsedCitation {
  /** Exactly what appeared in the text. */
  raw: string;
  kind: CitationKind;
  /** Canonical English work name, when recognised. */
  work?: string;
  /** Chapter / tractate page / siman, depending on kind. */
  primary?: number;
  /** Verse / seif, when present. */
  secondary?: number;
  /** 'a' or 'b' side of a talmudic daf. */
  amud?: "a" | "b";
  /** Sefaria ref string, when enough was parsed to build one. */
  sefariaRef?: string;
  /** Character offset of `raw` within the source text. */
  index: number;
}

// Tanach books, Hebrew → Sefaria's English name. Deliberately a literal map
// rather than a transliteration function: Sefaria's names are a fixed
// vocabulary, and a clever transliterator gets "Kohelet" vs "Ecclesiastes"
// wrong in a way that fails silently at fetch time.
const TANACH: Record<string, string> = {
  בראשית: "Genesis", שמות: "Exodus", ויקרא: "Leviticus", במדבר: "Numbers", דברים: "Deuteronomy",
  יהושע: "Joshua", שופטים: "Judges", שמואל: "I Samuel", מלכים: "I Kings",
  ישעיהו: "Isaiah", ישעיה: "Isaiah", ירמיהו: "Jeremiah", ירמיה: "Jeremiah", יחזקאל: "Ezekiel",
  הושע: "Hosea", יואל: "Joel", עמוס: "Amos", עובדיה: "Obadiah", יונה: "Jonah",
  מיכה: "Micah", נחום: "Nahum", חבקוק: "Habakkuk", צפניה: "Zephaniah", חגי: "Haggai",
  זכריה: "Zechariah", מלאכי: "Malachi",
  תהילים: "Psalms", תהלים: "Psalms", משלי: "Proverbs", איוב: "Job",
  "שיר השירים": "Song of Songs", רות: "Ruth", איכה: "Lamentations",
  קהלת: "Ecclesiastes", אסתר: "Esther", דניאל: "Daniel", עזרא: "Ezra",
  נחמיה: "Nehemiah", "דברי הימים": "I Chronicles",
};

// Bavli tractates. The common ones; extending this map is the whole cost of
// supporting another masechet.
const TRACTATES: Record<string, string> = {
  ברכות: "Berakhot", שבת: "Shabbat", עירובין: "Eruvin", פסחים: "Pesachim",
  ביצה: "Beitzah", "ראש השנה": "Rosh Hashanah", יומא: "Yoma", סוכה: "Sukkah",
  תענית: "Taanit", מגילה: "Megillah", "מועד קטן": "Moed Katan", חגיגה: "Chagigah",
  יבמות: "Yevamot", כתובות: "Ketubot", נדרים: "Nedarim", נזיר: "Nazir",
  סוטה: "Sotah", גיטין: "Gittin", קידושין: "Kiddushin",
  "בבא קמא": "Bava Kamma", "בבא מציעא": "Bava Metzia", "בבא בתרא": "Bava Batra",
  סנהדרין: "Sanhedrin", מכות: "Makkot", שבועות: "Shevuot",
  "עבודה זרה": "Avodah Zarah", הוריות: "Horayot", "אבות": "Pirkei Avot",
  זבחים: "Zevachim", מנחות: "Menachot", חולין: "Chullin", בכורות: "Bekhorot",
  ערכין: "Arakhin", תמורה: "Temurah", כריתות: "Keritot", מעילה: "Meilah",
  נדה: "Niddah", נידה: "Niddah",
};

// The four turim, as used in halachic citations.
const HALACHA_SECTIONS: Record<string, string> = {
  "אורח חיים": "Orach Chayim",
  "יורה דעה": "Yoreh De'ah",
  "אבן העזר": "Even HaEzer",
  "חושן משפט": "Choshen Mishpat",
};

const HALACHA_WORKS: Record<string, string> = {
  "שולחן ערוך": "Shulchan Arukh",
  "שו״ע": "Shulchan Arukh",
  "משנה ברורה": "Mishnah Berurah",
  "מ״ב": "Mishnah Berurah",
  טור: "Tur",
  "רמב״ם": "Mishneh Torah",
};

/** Longest-first, so "בבא מציעא" is matched before a bare "בבא" ever could. */
function alternation(keys: string[]): string {
  return [...keys].sort((a, b) => b.length - a.length).join("|");
}

// A Hebrew numeral as it appears in running text: letters, optionally with
// geresh/gershayim anywhere inside.
const NUM = "[א-ת]['״׳\"]?[א-ת]?['״׳\"]?[א-ת]?|\\d+";

const HEB = "\\u05D0-\\u05EA";

// WORD BOUNDARIES, and why they are not optional here.
//
// JavaScript's \b is ASCII-only, so it treats every Hebrew letter as a
// non-word character and fires between all of them — useless. Without a real
// boundary the book names match inside longer words: "הזהירות בדיבור" contains
// the letters of "רות" followed by something that reads as the gematria 16,
// and the parser confidently reports Ruth 16. That is not hypothetical; it is
// what the first version of this file did, and citations.test.ts still pins it.
//
// START allows the prefix letters Hebrew attaches directly to a noun —
// בבראשית ("in Genesis"), ובשבת ("and on Shabbat") — while the lookbehind
// refuses a match that begins in the middle of a word. Up to two, because
// stacking them ("ובבראשית") is ordinary.
const START = `(?<![${HEB}])[בוהלכמשד]{0,2}`;

// END refuses a number that is really the first letters of the next word.
const END = `(?![${HEB}])`;

const VERSE_PATTERN = new RegExp(
  `${START}(${alternation(Object.keys(TANACH))})\\s+(?:פרק\\s+)?(${NUM})` +
    `(?:[,:\\s]+(?:פסוק\\s+)?(${NUM}))?${END}`,
  "g"
);

// Daf notation, both forms speakers use: "נ״ט ע״ב" and the dot/colon
// shorthand "כא." (21a) / "כא:" (21b).
const TALMUD_PATTERN = new RegExp(
  `${START}(${alternation(Object.keys(TRACTATES))})\\s+(?:דף\\s+)?(${NUM})\\s*(ע[״'"]?[אב]|עמוד\\s+[אב]|[.:])?${END}`,
  "g"
);

const HALACHA_PATTERN = new RegExp(
  `${START}(${alternation(Object.keys(HALACHA_WORKS))})(?:\\s+(${alternation(Object.keys(HALACHA_SECTIONS))}))?` +
    `\\s*(?:סימן|סי[׳'])\\s*(${NUM})(?:\\s*(?:סעיף|ס[״'"]?ק)\\s*(${NUM}))?${END}`,
  "g"
);

function amudFrom(marker: string | undefined): "a" | "b" | undefined {
  if (!marker) return undefined;
  const clean = marker.replace(GERESH_PATTERN, "");
  if (clean === "." ) return "a";
  if (clean === ":") return "b";
  if (clean.endsWith("א")) return "a";
  if (clean.endsWith("ב")) return "b";
  return undefined;
}

/**
 * Finds every citation in a block of text.
 *
 * Deliberately conservative: a phrase that does not match one of the shapes
 * above is simply not returned. Under-detecting costs the user a source they
 * can still add by hand; over-detecting fills the Sources Panel with
 * confident nonsense, which is worse.
 *
 * Overlaps are resolved by preferring the longest match at a given position,
 * so "שולחן ערוך אורח חיים סימן ר״ה" is one halachic citation and not a
 * halachic one plus a stray book name.
 */
export function detectCitations(text: string): ParsedCitation[] {
  const found: ParsedCitation[] = [];

  for (const match of text.matchAll(VERSE_PATTERN)) {
    const [raw, book, chapter, verse] = match;
    if (!isCanonicalNumeral(chapter)) continue;
    const work = TANACH[book];
    const primary = parseNumber(chapter);
    const secondary = verse && isCanonicalNumeral(verse) ? parseNumber(verse) : undefined;
    found.push({
      raw: raw.trim(),
      kind: "verse",
      work,
      primary: primary ?? undefined,
      secondary: secondary ?? undefined,
      sefariaRef:
        primary === null ? undefined : `${work} ${primary}${secondary ? `:${secondary}` : ""}`,
      index: match.index,
    });
  }

  for (const match of text.matchAll(TALMUD_PATTERN)) {
    const [raw, tractate, daf, marker] = match;
    if (!isCanonicalNumeral(daf)) continue;
    const work = TRACTATES[tractate];
    const primary = parseNumber(daf);
    const amud = amudFrom(marker);
    found.push({
      raw: raw.trim(),
      kind: "talmud",
      work,
      primary: primary ?? undefined,
      amud,
      // Sefaria writes the daf as "59b"; with no amud given it defaults to a,
      // which is the same assumption a person makes reading "בבא מציעא נ״ט".
      sefariaRef: primary === null ? undefined : `${work} ${primary}${amud ?? "a"}`,
      index: match.index,
    });
  }

  for (const match of text.matchAll(HALACHA_PATTERN)) {
    const [raw, workName, section, siman, seif] = match;
    if (!isCanonicalNumeral(siman)) continue;
    const work = HALACHA_WORKS[workName];
    const primary = parseNumber(siman);
    const secondary = seif && isCanonicalNumeral(seif) ? parseNumber(seif) : undefined;
    const sectionName = section ? HALACHA_SECTIONS[section] : undefined;
    found.push({
      raw: raw.trim(),
      kind: "halacha",
      work: sectionName ? `${work}, ${sectionName}` : work,
      primary: primary ?? undefined,
      secondary: secondary ?? undefined,
      sefariaRef:
        primary === null
          ? undefined
          : `${work}${sectionName ? `, ${sectionName}` : ""} ${primary}${secondary ? `:${secondary}` : ""}`,
      index: match.index,
    });
  }

  return dedupeByPosition(found);
}

/**
 * Keeps the longest match starting at each position, and drops any match
 * fully contained inside another.
 */
function dedupeByPosition(citations: ParsedCitation[]): ParsedCitation[] {
  const sorted = [...citations].sort((a, b) => a.index - b.index || b.raw.length - a.raw.length);
  const kept: ParsedCitation[] = [];

  for (const citation of sorted) {
    const end = citation.index + citation.raw.length;
    const covered = kept.some(
      (existing) => citation.index >= existing.index && end <= existing.index + existing.raw.length
    );
    if (!covered) kept.push(citation);
  }

  return kept;
}

/**
 * Whether a model-supplied ref is one this module would itself have produced.
 *
 * The gate between AI output and a fetch. A ref that fails this is still
 * shown in the panel as the raw citation the speaker said — it just never
 * gets presented as a verified source or used to build a graph edge.
 */
export function isPlausibleSefariaRef(ref: string): boolean {
  return /^[A-Za-z'’\- ]+(,\s*[A-Za-z'’\- ]+)?\s+\d+[ab]?(:\d+)?$/.test(ref.trim());
}
