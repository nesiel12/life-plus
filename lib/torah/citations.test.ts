import { describe, expect, it } from "vitest";
import {
  detectCitations,
  hebrewNumeralToInt,
  isCanonicalNumeral,
  isPlausibleSefariaRef,
  parseNumber,
} from "@/lib/torah/citations";

describe("hebrewNumeralToInt", () => {
  it("reads single letters", () => {
    expect(hebrewNumeralToInt("א")).toBe(1);
    expect(hebrewNumeralToInt("י")).toBe(10);
    expect(hebrewNumeralToInt("ת")).toBe(400);
  });

  it("sums multi-letter numerals", () => {
    expect(hebrewNumeralToInt("יא")).toBe(11);
    expect(hebrewNumeralToInt("כא")).toBe(21);
    expect(hebrewNumeralToInt("נט")).toBe(59);
    expect(hebrewNumeralToInt("קיט")).toBe(119);
  });

  // The two numerals written irregularly so as not to spell a divine name.
  // A positional reader gets both wrong; summing gets both right.
  it("reads ט״ו as 15 and ט״ז as 16", () => {
    expect(hebrewNumeralToInt("ט״ו")).toBe(15);
    expect(hebrewNumeralToInt("ט״ז")).toBe(16);
  });

  it("ignores geresh and gershayim", () => {
    expect(hebrewNumeralToInt("נ״ט")).toBe(59);
    expect(hebrewNumeralToInt("ר״ה")).toBe(205);
    expect(hebrewNumeralToInt("ה׳")).toBe(5);
  });

  it("treats final forms as their base letter", () => {
    expect(hebrewNumeralToInt("ך")).toBe(hebrewNumeralToInt("כ"));
    expect(hebrewNumeralToInt("ם")).toBe(40);
    expect(hebrewNumeralToInt("ץ")).toBe(90);
  });

  it("handles repeated hundreds", () => {
    expect(hebrewNumeralToInt("תר")).toBe(600);
    expect(hebrewNumeralToInt("תתקצט")).toBe(999);
  });

  it("returns null for non-Hebrew input", () => {
    expect(hebrewNumeralToInt("59")).toBeNull();
    expect(hebrewNumeralToInt("abc")).toBeNull();
    expect(hebrewNumeralToInt("")).toBeNull();
    expect(hebrewNumeralToInt("   ")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("accepts digits as well as gematria", () => {
    expect(parseNumber("59")).toBe(59);
    expect(parseNumber("נ״ט")).toBe(59);
  });

  it("returns null for anything else", () => {
    expect(parseNumber("xyz")).toBeNull();
  });
});

describe("detectCitations — verses", () => {
  it("finds a chapter-and-verse reference", () => {
    const [citation] = detectCitations("כמו שכתוב בבראשית א׳ א׳");
    expect(citation.kind).toBe("verse");
    expect(citation.work).toBe("Genesis");
    expect(citation.sefariaRef).toBe("Genesis 1:1");
  });

  it("finds a chapter-only reference", () => {
    const [citation] = detectCitations("תהילים קי״ט");
    expect(citation.sefariaRef).toBe("Psalms 119");
  });

  it("reads the פרק / פסוק wording", () => {
    const [citation] = detectCitations("שמות פרק כ פסוק ב");
    expect(citation.sefariaRef).toBe("Exodus 20:2");
  });

  it("accepts spelling variants of a book name", () => {
    expect(detectCitations("ישעיה ו")[0].work).toBe("Isaiah");
    expect(detectCitations("ישעיהו ו")[0].work).toBe("Isaiah");
  });

  it("records where in the text it was found", () => {
    const text = "פתיחה ואז תהילים קי״ט";
    const [citation] = detectCitations(text);
    expect(text.slice(citation.index, citation.index + citation.raw.length)).toBe(citation.raw);
  });
});

describe("detectCitations — talmud", () => {
  it("reads daf and amud", () => {
    const [citation] = detectCitations("בבא מציעא נ״ט ע״ב");
    expect(citation.kind).toBe("talmud");
    expect(citation.work).toBe("Bava Metzia");
    expect(citation.primary).toBe(59);
    expect(citation.amud).toBe("b");
    expect(citation.sefariaRef).toBe("Bava Metzia 59b");
  });

  it("defaults to amud alef when none is given", () => {
    expect(detectCitations("ברכות ב")[0].sefariaRef).toBe("Berakhot 2a");
  });

  it("reads the dot/colon shorthand", () => {
    expect(detectCitations("שבת כא.")[0].sefariaRef).toBe("Shabbat 21a");
    expect(detectCitations("שבת כא:")[0].sefariaRef).toBe("Shabbat 21b");
  });

  it("prefers the full tractate name over a prefix of it", () => {
    // "בבא" alone must never win against "בבא מציעא".
    expect(detectCitations("בבא מציעא נ״ט")[0].work).toBe("Bava Metzia");
    expect(detectCitations("בבא בתרא ב")[0].work).toBe("Bava Batra");
  });

  it("finds several citations in one passage", () => {
    const refs = detectCitations("הובא בברכות ב ובשבת כא: ובסנהדרין צ").map((c) => c.sefariaRef);
    expect(refs).toContain("Berakhot 2a");
    expect(refs).toContain("Shabbat 21b");
    expect(refs).toContain("Sanhedrin 90a");
  });
});

describe("detectCitations — halacha", () => {
  it("reads work, section and siman", () => {
    const [citation] = detectCitations("שולחן ערוך אורח חיים סימן ר״ה");
    expect(citation.kind).toBe("halacha");
    expect(citation.work).toBe("Shulchan Arukh, Orach Chayim");
    expect(citation.primary).toBe(205);
    expect(citation.sefariaRef).toBe("Shulchan Arukh, Orach Chayim 205");
  });

  it("reads a seif katan", () => {
    const [citation] = detectCitations("משנה ברורה סימן א ס״ק ב");
    expect(citation.work).toBe("Mishnah Berurah");
    expect(citation.sefariaRef).toBe("Mishnah Berurah 1:2");
  });

  it("works without a section", () => {
    expect(detectCitations("טור סימן ה")[0].sefariaRef).toBe("Tur 5");
  });
});

describe("detectCitations — restraint", () => {
  it("returns nothing for prose with no citation", () => {
    expect(detectCitations("היום נלמד על חשיבות הזהירות בדיבור")).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(detectCitations("")).toEqual([]);
  });

  it("does not invent a ref from a book name with no number", () => {
    // A speaker naming a sefer in passing is not a citation to fetch.
    expect(detectCitations("הוא מביא את השולחן ערוך")).toEqual([]);
  });

  it("does not return a match contained inside a longer one", () => {
    const citations = detectCitations("שולחן ערוך אורח חיים סימן ר״ה");
    expect(citations).toHaveLength(1);
  });
});

describe("isPlausibleSefariaRef", () => {
  it("accepts the shapes this module produces", () => {
    expect(isPlausibleSefariaRef("Genesis 1:1")).toBe(true);
    expect(isPlausibleSefariaRef("Bava Metzia 59b")).toBe(true);
    expect(isPlausibleSefariaRef("Shulchan Arukh, Orach Chayim 205")).toBe(true);
  });

  it("rejects free text a model might hand back instead", () => {
    expect(isPlausibleSefariaRef("somewhere in Berakhot")).toBe(false);
    expect(isPlausibleSefariaRef("בבא מציעא נ״ט")).toBe(false);
    expect(isPlausibleSefariaRef("")).toBe(false);
  });
});

// Regressions found in the first real lesson transcripts (2026-09-17).
describe("detectCitations — words that look like numbers", () => {
  it("skips the word דף before a daf", () => {
    const [citation] = detectCitations("במסכת בבא מציעא דף נ״ט ע״ב");
    expect(citation.sefariaRef).toBe("Bava Metzia 59b");
  });

  it("reads the spelled-out עמוד", () => {
    expect(detectCitations("בבא מציעא דף נט עמוד ב")[0].sefariaRef).toBe("Bava Metzia 59b");
  });

  it("does not read a rabbi's name followed by a word as a verse", () => {
    expect(detectCitations("עמד רבי יהושע על רגליו")).toEqual([]);
    expect(detectCitations("אמר רבי יהושע בן לוי")).toEqual([]);
  });

  it("accepts only canonically written numerals", () => {
    expect(["נט", "נ״ט", "רה", "טו", "ט״ז", "תשפו", "12"].every(isCanonicalNumeral)).toBe(true);
    expect(["דף", "על", "בן", "יה", "כי"].some(isCanonicalNumeral)).toBe(false);
  });
});
