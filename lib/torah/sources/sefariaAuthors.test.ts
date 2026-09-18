import { describe, expect, it } from "vitest";
import { parseSefariaAuthorTopic, type SefariaTopicResult } from "@/lib/torah/sources/sefariaAuthors";
import { channelIdFromUrl, parseChannelFeed } from "@/lib/torah/sources/youtube";

// Trimmed from a real /api/v2/topics/israel-meir-kagan response.
const topic: SefariaTopicResult = {
  slug: "israel-meir-kagan",
  subclass: "author",
  primaryTitle: { en: "Israel Meir Kagan (Chafetz Chaim)", he: "רבי ישראל מאיר הכהן" },
  titles: [
    { text: "Chafetz Chaim", lang: "en" },
    { text: "רבי ישראל מאיר הכהן", lang: "he", primary: true },
    { text: "חפץ חיים", lang: "he" },
  ],
  description: { en: "Rabbi Israel Meir Kagan was…", he: "ישראל מאיר הכהן, הידוע גם כ״חפץ חיים״…" },
  properties: {
    birthYear: { value: 1839 },
    deathYear: { value: 1933 },
    era: { value: "AH" },
    heBio: { value: "ישראל מאיר (הכהן) קגן, הידוע גם כ״חפץ חיים״ על שם ספרו, היה מגדולי יהדות אשכנז." },
    heWikiLink: { value: "https://he.wikipedia.org/wiki/x" },
  },
  links: {
    taught: {
      links: [
        { topic: "elchonon-wasserman", title: { en: "Elchonon Wasserman", he: "רבי אלחנן וסרמן" }, isInverse: false },
        { topic: "some-teacher", title: { en: "Some Teacher", he: "" }, isInverse: true },
        { topic: "a-teacher", title: { en: "A Teacher", he: "רבי נחומק׳ה מהורודנא" }, isInverse: true },
      ],
    },
  },
  indexes: [
    {
      title: { en: "Sefer HaMitzvot HaKatzar", he: "ספר המצות הקצר" },
      description: {
        en: "20th-century list of the commandments…",
        he: "רשימה מן המאה ה-20 של כל המצוות החלות בחוץ לארץ.",
      },
      compDate: 1930,
    },
    { title: { en: "Chafetz Chaim on Sifra", he: "חפץ חיים על ספרא" }, description: { en: "A commentary", he: "" }, compDate: 1933 },
    { title: { en: "English Only", he: "" } },
  ],
};

describe("parseSefariaAuthorTopic", () => {
  const profile = parseSefariaAuthorTopic(topic)!;

  it("reads the Hebrew name, aliases, years and era", () => {
    expect(profile.hebrewName).toBe("רבי ישראל מאיר הכהן");
    expect(profile.hebrewAliases).toEqual(["חפץ חיים"]);
    expect(profile).toMatchObject({ birthYear: 1839, deathYear: 1933, era: "AH" });
  });

  it("uses the Hebrew biography and never the English one", () => {
    expect(profile.bio).toContain("חפץ חיים");
    expect(profile.bio).not.toMatch(/[A-Za-z]{4,}/);
  });

  it("reads `taught` links in the right direction and drops names with no Hebrew", () => {
    expect(profile.lineage).toEqual([
      { name: "רבי אלחנן וסרמן", relation: "student", sefariaSlug: "elchonon-wasserman", origin: "import", confidence: 1 },
      { name: "רבי נחומק׳ה מהורודנא", relation: "teacher", sefariaSlug: "a-teacher", origin: "import", confidence: 1 },
    ]);
  });

  it("builds the bookshelf from Hebrew titles and Hebrew descriptions only", () => {
    expect(profile.works).toEqual([
      {
        title: "ספר המצות הקצר",
        description: "רשימה מן המאה ה-20 של כל המצוות החלות בחוץ לארץ.",
        year: 1930,
        sefariaTitle: "Sefer HaMitzvot HaKatzar",
        origin: "import",
        confidence: 1,
      },
      {
        title: "חפץ חיים על ספרא",
        description: undefined,
        year: 1933,
        sefariaTitle: "Chafetz Chaim on Sifra",
        origin: "import",
        confidence: 1,
      },
    ]);
  });

  it("returns null without a slug", () => {
    expect(parseSefariaAuthorTopic({})).toBeNull();
  });
});

describe("YouTube channel feed", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>ערוץ השיעורים</title>
 <author><name>ערוץ השיעורים</name></author>
 <entry>
  <yt:videoId>C4exbdl5H-s</yt:videoId>
  <title>שיעור בהלכות שבת &amp; חגים</title>
  <published>2026-09-01T10:00:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>bad</yt:videoId>
  <title>broken entry</title>
 </entry>
</feed>`;

  it("parses entries, decodes entities and skips malformed ones", () => {
    expect(parseChannelFeed(xml)).toEqual([
      {
        videoId: "C4exbdl5H-s",
        title: "שיעור בהלכות שבת & חגים",
        channelTitle: "ערוץ השיעורים",
        publishedAt: "2026-09-01T10:00:00+00:00",
        thumbnailUrl: "https://i.ytimg.com/vi/C4exbdl5H-s/hqdefault.jpg",
        source: "channel",
      },
    ]);
  });

  it("reads a channel id only from /channel/ URLs", () => {
    expect(channelIdFromUrl("https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ")).toBe("UCBR8-60-B28hp2BmDPdntcQ");
    expect(channelIdFromUrl("https://www.youtube.com/@SomeRav")).toBeNull();
  });
});
