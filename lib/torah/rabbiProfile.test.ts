import { describe, expect, it } from "vitest";
import {
  findLibraryBook,
  findLibraryRabbi,
  internationalPhone,
  mediaSearchQueries,
  mergeLineage,
  mergeWorks,
  rabbiInitials,
  safeHttpUrl,
  telHref,
  whatsappHref,
  youtubeChannelHref,
  type LineageEntry,
  type RabbiWork,
} from "@/lib/torah/rabbiProfile";

const teacher = (overrides: Partial<LineageEntry> = {}): LineageEntry => ({
  name: "רבי חיים מוולוז׳ין",
  relation: "teacher",
  origin: "ai",
  confidence: 0.6,
  ...overrides,
});

describe("mergeLineage", () => {
  it("converges re-enrichment instead of stacking duplicates", () => {
    const merged = mergeLineage([teacher()], [teacher()]);
    expect(merged).toHaveLength(1);
  });

  it("lets a Sefaria record replace a model's guess about the same person", () => {
    const merged = mergeLineage(
      [teacher({ name: "הרב חיים מוולוז׳ין", origin: "ai", confidence: 0.9 })],
      [teacher({ name: "רבי חיים מוולוז׳ין", origin: "import", confidence: 1, sefariaSlug: "chaim-of-volozhin" })]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ origin: "import", sefariaSlug: "chaim-of-volozhin" });
  });

  it("never lets an AI entry displace one the user added", () => {
    const merged = mergeLineage([teacher({ origin: "user", confidence: 1 })], [teacher({ origin: "ai", confidence: 0.9 })]);
    expect(merged[0].origin).toBe("user");
  });

  it("keeps a teacher and a student with the same name apart", () => {
    const merged = mergeLineage([teacher()], [teacher({ relation: "student" })]);
    expect(merged).toHaveLength(2);
  });

  it("keeps the higher confidence between two guesses", () => {
    const merged = mergeLineage([teacher({ confidence: 0.4 })], [teacher({ confidence: 0.8 })]);
    expect(merged[0].confidence).toBe(0.8);
  });
});

describe("mergeWorks", () => {
  const work = (overrides: Partial<RabbiWork> = {}): RabbiWork => ({
    title: "משנה ברורה",
    origin: "ai",
    confidence: 0.7,
    ...overrides,
  });

  it("fills a record's gaps from the guess instead of dropping them", () => {
    const merged = mergeWorks(
      [work({ description: "פירוש על אורח חיים", year: 1884 })],
      [work({ origin: "import", confidence: 1, sefariaTitle: "Mishnah Berurah" })]
    );
    expect(merged).toEqual([
      {
        title: "משנה ברורה",
        origin: "import",
        confidence: 1,
        sefariaTitle: "Mishnah Berurah",
        description: "פירוש על אורח חיים",
        year: 1884,
      },
    ]);
  });

  it("orders the shelf by year, undated last", () => {
    const merged = mergeWorks([], [work({ title: "ג", year: undefined }), work({ title: "ב", year: 1900 }), work({ title: "א", year: 1870 })]);
    expect(merged.map((w) => w.title)).toEqual(["א", "ב", "ג"]);
  });
});

describe("library matching", () => {
  it("finds a book by Sefaria id before title", () => {
    const books = [
      { id: "1", title: "Mishna Brura", externalRefs: { sefaria: { id: "Mishnah Berurah" } } },
      { id: "2", title: "משנה ברורה" },
    ];
    expect(findLibraryBook({ title: "משנה ברורה", sefariaTitle: "Mishnah Berurah" }, books)?.id).toBe("1");
  });

  it("finds a rabbi by slug, then by name without honorifics", () => {
    const rabbis = [
      { id: "a", name: "החפץ חיים", externalRefs: { sefaria: { slug: "israel-meir-kagan" } } },
      { id: "b", name: "הרב אברהם יצחק הכהן קוק" },
    ];
    expect(findLibraryRabbi({ name: "רבי ישראל מאיר הכהן", sefariaSlug: "israel-meir-kagan" }, rabbis)?.id).toBe("a");
    expect(findLibraryRabbi({ name: "רבי אברהם יצחק הכהן קוק זצ״ל" }, rabbis)?.id).toBe("b");
    expect(findLibraryRabbi({ name: "רבי עקיבא" }, rabbis)).toBeUndefined();
  });
});

describe("contact links", () => {
  it("only produces http(s) URLs", () => {
    expect(safeHttpUrl("example.org")).toBe("https://example.org/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("localhost")).toBeNull();
  });

  it("normalises Israeli phone numbers to international form", () => {
    expect(internationalPhone("050-123-4567")).toBe("972501234567");
    expect(internationalPhone("+972 50 123 4567")).toBe("972501234567");
    expect(telHref("02-6234567")).toBe("tel:+97226234567");
    expect(internationalPhone("123")).toBeNull();
  });

  it("accepts only WhatsApp's own hosts for a group link", () => {
    expect(whatsappHref("https://chat.whatsapp.com/AbCdEf")).toBe("https://chat.whatsapp.com/AbCdEf");
    expect(whatsappHref("https://evil.example/chat.whatsapp.com")).toBeNull();
    expect(whatsappHref("0501234567")).toBe("https://wa.me/972501234567");
  });

  it("accepts only youtube.com for a channel", () => {
    expect(youtubeChannelHref("https://www.youtube.com/@SomeRav")).toBe("https://www.youtube.com/@SomeRav");
    expect(youtubeChannelHref("https://vimeo.com/rav")).toBeNull();
  });
});

describe("presentation helpers", () => {
  it("builds Hebrew YouTube queries, including the rabbi's works", () => {
    expect(mediaSearchQueries({ name: "החפץ חיים", works: [{ title: "שמירת הלשון" }], kind: "rabbi" })).toEqual([
      "החפץ חיים שיעור",
      "החפץ חיים הרצאה",
      "החפץ חיים שמירת הלשון",
    ]);
    expect(mediaSearchQueries({ name: "", kind: "book" })).toEqual([]);
  });

  it("draws initials from the identifying words, not the title", () => {
    expect(rabbiInitials("הרב אברהם יצחק קוק")).toBe("אק");
    expect(rabbiInitials("רש״י")).toBe("רש");
  });
});
