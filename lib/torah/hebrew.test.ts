import { describe, expect, it } from "vitest";
import {
  bookTitleKey,
  eraLabel,
  hebrewOnly,
  hebrewProse,
  hebrewRatio,
  normalizeHebrewPunctuation,
  hebrewYearLabel,
  intToHebrewNumeral,
  isHebrewText,
  lifespanLabel,
  rabbiNameKey,
  sameBookTitle,
  sameRabbiName,
} from "@/lib/torah/hebrew";
import { hebrewNumeralToInt } from "@/lib/torah/citations";

describe("the Hebrew-at-source gate", () => {
  it("accepts Hebrew prose, including a stray Latin acronym", () => {
    expect(isHebrewText("ה״משנה ברורה״ הינה יצירת הלכה פרי עטו של ר׳ ישראל מאיר הכהן")).toBe(true);
    expect(isHebrewText("סיכום השיעור בקובץ PDF")).toBe(true);
  });

  // The bug this gate exists for: Sefaria's English blurb stored as the
  // description of "מסילת ישרים".
  it("rejects English prose", () => {
    expect(isHebrewText("Mesillat Yesharim is an ethical (musar) text composed by the Ramchal")).toBe(false);
    expect(hebrewOnly("Moses Chaim Luzzatto (Ramchal)")).toBeUndefined();
    expect(hebrewOnly("Musar")).toBeUndefined();
  });

  it("rejects an English sentence that quotes a Hebrew title", () => {
    expect(isHebrewText("A commentary on the book משנה ברורה written in Radin")).toBe(false);
  });

  it("treats blank and letterless strings as not Hebrew", () => {
    expect(hebrewOnly("   ")).toBeUndefined();
    expect(hebrewOnly(null)).toBeUndefined();
    expect(hebrewRatio("1839–1933")).toBe(0);
  });

  // Observed in real model output: an Arabic word mid-sentence.
  it("removes foreign-script drift from model prose but keeps Latin acronyms", () => {
    expect(hebrewProse("הוא פועל בדור המעבר שבין תקופת التاسعים של הציונות הדתית")).toBe(
      "הוא פועל בדור המעבר שבין תקופת של הציונות הדתית"
    );
    expect(hebrewProse("שורה ראשונה\n\nשורה שנייה עם PDF")).toBe("שורה ראשונה\n\nשורה שנייה עם PDF");
  });

  it("counts other scripts against the Hebrew share", () => {
    expect(isHebrewText("مرحبا بكم في هذا المكان الجميل שלום")).toBe(false);
  });

  it("trims what it accepts", () => {
    expect(hebrewOnly("  אחרונים \n")).toBe("אחרונים");
  });
});

describe("Hebrew numerals", () => {
  it("writes gershayim before the last letter and geresh on a single letter", () => {
    expect(intToHebrewNumeral(599)).toBe("תקצ״ט");
    expect(intToHebrewNumeral(5)).toBe("ה׳");
    expect(intToHebrewNumeral(205)).toBe("ר״ה");
  });

  it("never spells a divine name for 15 and 16", () => {
    expect(intToHebrewNumeral(15)).toBe("ט״ו");
    expect(intToHebrewNumeral(16)).toBe("ט״ז");
    expect(intToHebrewNumeral(715)).toBe("תשט״ו");
  });

  it("round-trips through the citation parser", () => {
    for (const n of [1, 15, 16, 99, 205, 400, 613, 786, 999]) {
      expect(hebrewNumeralToInt(intToHebrewNumeral(n))).toBe(n);
    }
  });

  it("labels Gregorian years as Hebrew years", () => {
    expect(hebrewYearLabel(1839)).toBe("ה׳תקצ״ט");
    expect(hebrewYearLabel(1933)).toBe("ה׳תרצ״ג");
    expect(hebrewYearLabel(2026)).toBe("ה׳תשפ״ו");
  });

  it("formats a lifespan with whatever part is known", () => {
    expect(lifespanLabel(1839, 1933)).toBe("ה׳תקצ״ט–ה׳תרצ״ג (1839–1933)");
    expect(lifespanLabel(1940, undefined)).toBe("ה׳ת״ש–? (1940–?)");
    expect(lifespanLabel(undefined, undefined)).toBeNull();
  });
});

describe("eraLabel", () => {
  it("maps Sefaria's codes to Hebrew and passes Hebrew labels through", () => {
    expect(eraLabel("AH")).toBe("אחרונים");
    expect(eraLabel("RI")).toBe("ראשונים");
    expect(eraLabel("אחרונים")).toBe("אחרונים");
  });

  it("drops an unknown non-Hebrew label rather than showing English", () => {
    expect(eraLabel("Medieval")).toBeUndefined();
  });
});

describe("name matching", () => {
  it("ignores titles and blessings around a rabbi's name", () => {
    expect(sameRabbiName("הרב ישראל מאיר הכהן זצ״ל", "רבי ישראל מאיר הכהן")).toBe(true);
    expect(sameRabbiName("מרן הרב קוק", "קוק")).toBe(true);
    expect(sameRabbiName('הגאון רבי חיים זצ"ל', "חיים")).toBe(true);
  });

  it("does not strip a name down to nothing", () => {
    expect(rabbiNameKey("מרן")).toBe("מרן");
    expect(sameRabbiName("", "")).toBe(false);
  });

  it("keeps different rabbis different", () => {
    expect(sameRabbiName("הרב קוק", "הרב קנייבסקי")).toBe(false);
  });

  it("matches book titles across geresh forms and a leading ספר", () => {
    expect(sameBookTitle("ספר החינוך", "החינוך")).toBe(true);
    expect(sameBookTitle('שו"ע', "שו״ע")).toBe(true);
    expect(bookTitleKey("ליקוטי מוהר״ן")).toBe("ליקוטי מוהרן");
  });
});

describe("normalizeHebrewPunctuation", () => {
  it("uses gershayim inside abbreviations and geresh after numerals", () => {
    expect(normalizeHebrewPunctuation('הרמב"ם בפרק ט\' הלכה א\'')).toBe("הרמב״ם בפרק ט׳ הלכה א׳");
    expect(normalizeHebrewPunctuation('דף נ"ט ע"ב')).toBe("דף נ״ט ע״ב");
  });

  it("leaves real quotation marks around words alone", () => {
    expect(normalizeHebrewPunctuation('אמר "לא בשמים היא"')).toBe('אמר "לא בשמים היא"');
  });
});
