import { describe, expect, it } from "vitest";
import {
  mergeExternalBooks,
  parseGoogleVolume,
  parseSefariaIndex,
  parseSefariaNameResult,
  type ExternalBook,
} from "@/lib/torah/sources/providers";

const sefaria = (overrides: Partial<ExternalBook> = {}): ExternalBook => ({
  provider: "sefaria",
  externalId: "Mesillat Yesharim",
  title: "מסילת ישרים",
  hebrewTitle: "מסילת ישרים",
  author: "רבי משה חיים לוצאטו",
  categories: ["מוסר"],
  publishedYear: 1738,
  ...overrides,
});

const google = (overrides: Partial<ExternalBook> = {}): ExternalBook => ({
  provider: "googleBooks",
  externalId: "abc123",
  title: "מסילת ישרים",
  author: "רמח״ל",
  coverImageUrl: "https://books.google.com/cover.jpg",
  averagePrice: 45,
  rating: 4.5,
  ratingsCount: 12,
  ...overrides,
});

describe("mergeExternalBooks", () => {
  it("returns whichever side exists when the other is null", () => {
    expect(mergeExternalBooks(sefaria(), null)?.provider).toBe("sefaria");
    expect(mergeExternalBooks(null, google())?.provider).toBe("googleBooks");
    expect(mergeExternalBooks(null, null)).toBeNull();
  });

  it("lets Sefaria win on the fields it is authoritative for", () => {
    const merged = mergeExternalBooks(sefaria(), google());
    expect(merged?.author).toBe("רבי משה חיים לוצאטו");
    expect(merged?.categories).toEqual(["מוסר"]);
    expect(merged?.publishedYear).toBe(1738);
  });

  it("takes cover, price and rating from Google, which Sefaria never has", () => {
    const merged = mergeExternalBooks(sefaria(), google());
    expect(merged?.coverImageUrl).toBe("https://books.google.com/cover.jpg");
    expect(merged?.averagePrice).toBe(45);
    expect(merged?.rating).toBe(4.5);
  });

  it("falls back to Google when Sefaria is missing a field", () => {
    const merged = mergeExternalBooks(sefaria({ author: undefined }), google());
    expect(merged?.author).toBe("רמח״ל");
  });

  // Sefaria's index returns "" — not null — for fields it has no value for,
  // and `??` does not fall through an empty string.
  it("treats an empty string from a provider as missing, not as a value", () => {
    const merged = mergeExternalBooks(
      sefaria({ description: "", author: "", hebrewTitle: "" }),
      google({ description: "ספר יסוד בעבודת המידות.", author: "רמח״ל", hebrewTitle: "מסילת ישרים" })
    );
    expect(merged?.description).toBe("ספר יסוד בעבודת המידות.");
    expect(merged?.author).toBe("רמח״ל");
    expect(merged?.hebrewTitle).toBe("מסילת ישרים");
  });

  it("treats a whitespace-only string as missing too", () => {
    const merged = mergeExternalBooks(sefaria({ description: "   \n  " }), google({ description: "תיאור אמיתי." }));
    expect(merged?.description).toBe("תיאור אמיתי.");
  });

  it("treats an empty categories array as missing", () => {
    const merged = mergeExternalBooks(sefaria({ categories: [] }), google({ categories: ["יהדות"] }));
    expect(merged?.categories).toEqual(["יהדות"]);
  });

  it("leaves a field undefined when neither side has it", () => {
    const merged = mergeExternalBooks(sefaria({ description: "" }), google({ description: undefined }));
    expect(merged?.description).toBeUndefined();
  });

  it("does not resurrect an empty Google cover URL", () => {
    expect(mergeExternalBooks(sefaria(), google({ coverImageUrl: "" }))?.coverImageUrl).toBeUndefined();
  });

  // The native-Hebrew rule, enforced at the merge as defence in depth: an
  // English value from any provider never reaches a book row.
  it("never lets English text through, even from a provider that returned it", () => {
    const merged = mergeExternalBooks(
      sefaria({ description: undefined, author: undefined, categories: ["Musar"] }),
      google({ description: "A classic work of mussar.", author: "Ramchal", categories: ["Religion"] })
    );
    expect(merged?.description).toBeUndefined();
    expect(merged?.author).toBeUndefined();
    expect(merged?.categories).toBeUndefined();
  });
});

describe("parseSefariaIndex", () => {
  // Trimmed from the real /api/v2/index/Mishnah_Berurah response.
  const index = {
    title: "Mishnah Berurah",
    heTitle: "משנה ברורה",
    categories: ["Halakhah", "Shulchan Arukh", "Commentary", "Mishnah Berurah"],
    heCategories: ["הלכה", "שולחן ערוך", "מפרשים", "משנה ברורה"],
    authors: [{ en: "Israel Meir Kagan (Chafetz Chaim)", he: "רבי ישראל מאיר הכהן", slug: "israel-meir-kagan" }],
    compDate: [1875, 1905],
    compPlaceString: { en: "Raduń", he: "ראדין" },
    era: "AH",
    heDesc: 'ה"משנה ברורה" הינה יצירת הלכה פרי עטו של ר\' ישראל מאיר הכהן מראדין.',
    heShortDesc: "Late-19th century commentary on the Orach Chaim section of the Shulchan Arukh",
  };

  it("reads only the Hebrew fields", () => {
    expect(parseSefariaIndex(index)).toEqual({
      provider: "sefaria",
      externalId: "Mishnah Berurah",
      title: "משנה ברורה",
      hebrewTitle: "משנה ברורה",
      author: "רבי ישראל מאיר הכהן",
      authorSlug: "israel-meir-kagan",
      categories: ["הלכה", "שולחן ערוך", "מפרשים", "משנה ברורה"],
      publishedYear: 1875,
      description: index.heDesc,
      compositionPlace: "ראדין",
      era: "AH",
    });
  });

  // Sefaria really does ship English in heShortDesc for some works.
  it("rejects English that arrives in a Hebrew-named field", () => {
    const parsed = parseSefariaIndex({ ...index, heDesc: "" });
    expect(parsed?.description).toBeUndefined();
  });

  it("returns null for an index with no title", () => {
    expect(parseSefariaIndex({})).toBeNull();
  });
});

describe("parseSefariaNameResult", () => {
  it("separates books from author topics and skips sub-sections", () => {
    const result = parseSefariaNameResult({
      completion_objects: [
        { title: "חפץ חיים", key: "Chafetz Chaim", type: "ref" },
        { title: "חפץ חיים, הקדמה", key: "Chafetz Chaim, Preface", type: "ref" },
        { title: "חפץ חיים", key: "israel-meir-kagan", type: "AuthorTopic" },
        { title: "רמ״ק", key: ["Kabbalah", "Ramak"], type: "TocCategory" },
      ],
    });
    expect(result.books).toEqual([
      { provider: "sefaria", externalId: "Chafetz Chaim", title: "חפץ חיים", hebrewTitle: "חפץ חיים" },
    ]);
    expect(result.authors).toEqual([{ slug: "israel-meir-kagan", name: "חפץ חיים" }]);
  });
});

describe("parseGoogleVolume", () => {
  it("keeps Hebrew text, drops English text, and reads ISBN and ILS price", () => {
    const parsed = parseGoogleVolume({
      id: "vol1",
      volumeInfo: {
        title: "מסילת ישרים",
        authors: ["Moshe Chaim Luzzatto"],
        description: "<p>A classic.</p>",
        categories: ["Religion"],
        publishedDate: "2011-05",
        imageLinks: { thumbnail: "http://books.google.com/c.jpg" },
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9789650000000" }],
      },
      saleInfo: { retailPrice: { amount: 59, currencyCode: "ILS" } },
    });
    expect(parsed).toMatchObject({
      title: "מסילת ישרים",
      hebrewTitle: "מסילת ישרים",
      author: undefined,
      description: undefined,
      categories: undefined,
      publishedYear: 2011,
      coverImageUrl: "https://books.google.com/c.jpg",
      averagePrice: 59,
      isbn: "9789650000000",
    });
  });
});
