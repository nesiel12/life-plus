import { describe, expect, it } from "vitest";
import { buildAutoLinkTargets, linkifyHtml, linkifyText } from "@/lib/torah/autoLink";
import type { CatalogSefer } from "@/lib/torah/seforimCatalog";

const catalog: CatalogSefer[] = [
  { title: "שולחן ערוך", aliases: ["שו״ע"], category: "הלכה" },
  { title: "קיצור שולחן ערוך", category: "הלכה" },
  { title: "משנה ברורה", category: "הלכה" },
  { title: "מסילת ישרים", category: "מוסר" },
];

const library = [{ id: "book-mb", title: "משנה ברורה", hebrewTitle: "משנה ברורה" }];

const links = (text: string, targets = buildAutoLinkTargets(library, catalog)) =>
  linkifyText(text, targets).filter((s) => s.kind === "link");

describe("buildAutoLinkTargets", () => {
  it("points a catalogue title at the library row when the user has the book", () => {
    const targets = buildAutoLinkTargets(library, catalog);
    const mb = targets.find((t) => t.label === "משנה ברורה");
    expect(mb?.bookId).toBe("book-mb");
    expect(targets.find((t) => t.label === "שולחן ערוך")?.bookId).toBeUndefined();
  });

  it("does not link a book's own name on its own page", () => {
    const targets = buildAutoLinkTargets(library, catalog, { excludeBookId: "book-mb" });
    expect(targets.some((t) => t.label === "משנה ברורה")).toBe(false);
  });
});

describe("linkifyText", () => {
  it("links a book name in prose", () => {
    const [link] = links("כמו שפוסק המשנה ברורה בהלכות שבת");
    expect(link).toMatchObject({ kind: "link", text: "משנה ברורה", target: { bookId: "book-mb" } });
  });

  it("allows Hebrew prefix letters but keeps them outside the link", () => {
    const segments = linkifyText("ובשולחן ערוך כתוב", buildAutoLinkTargets([], catalog));
    expect(segments).toEqual([
      { kind: "text", text: "ובשולחן ערוך".slice(0, 2) },
      { kind: "link", text: "שולחן ערוך", target: { label: "שולחן ערוך", title: "שולחן ערוך" } },
      { kind: "text", text: " כתוב" },
    ]);
  });

  it("does not link inside a longer word", () => {
    expect(links("ערוכים שולחנות")).toHaveLength(0);
    expect(links("משנה ברורהות")).toHaveLength(0);
  });

  it("prefers the longest title", () => {
    const [link] = links("למדתי קיצור שולחן ערוך");
    expect(link && link.kind === "link" && link.target.title).toBe("קיצור שולחן ערוך");
  });

  it("matches an abbreviation written with ASCII quotes", () => {
    const [link] = links('כך פסק השו"ע');
    expect(link && link.kind === "link" && link.target.title).toBe("שולחן ערוך");
  });

  it("links each book once, at its first mention", () => {
    expect(links("משנה ברורה ועוד משנה ברורה")).toHaveLength(1);
  });

  it("returns the text untouched when nothing matches", () => {
    expect(linkifyText("שיעור על אהבת חסד", buildAutoLinkTargets(library, catalog))).toEqual([
      { kind: "text", text: "שיעור על אהבת חסד" },
    ]);
  });
});

describe("linkifyHtml", () => {
  const targets = buildAutoLinkTargets(library, catalog);

  it("wraps matches in text nodes with escaped data attributes", () => {
    const html = linkifyHtml("<p>לפי מסילת ישרים</p>", targets);
    expect(html).toBe(
      '<p>לפי <span class="auto-book-link" role="link" tabindex="0" data-auto-book-title="מסילת ישרים">מסילת ישרים</span></p>'
    );
  });

  it("uses the library id when the book is on the shelf", () => {
    expect(linkifyHtml("<p>משנה ברורה</p>", targets)).toContain('data-auto-book-id="book-mb"');
  });

  it("leaves existing links, mention chips and code alone", () => {
    const input =
      '<p><a href="https://x.org">משנה ברורה</a> <span class="entity-mention" data-entity-type="book">@שולחן ערוך</span> <code>מסילת ישרים</code></p>';
    expect(linkifyHtml(input, targets)).toBe(input);
  });

  it("resumes linking after a skipped element closes", () => {
    const html = linkifyHtml('<p><a href="#">קישור</a> ואז מסילת ישרים</p>', targets);
    expect(html).toContain('data-auto-book-title="מסילת ישרים"');
  });

  it("matches across an HTML-escaped quote", () => {
    expect(linkifyHtml("<p>השו&quot;ע</p>", targets)).toContain("auto-book-link");
  });
});
