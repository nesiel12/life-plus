import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  importKindFor,
  markdownToHtml,
  safeFilename,
  textToHtml,
} from "@/lib/summaries/documentFormat";

describe("importKindFor", () => {
  it("recognises the supported extensions", () => {
    expect(importKindFor("notes.docx")).toBe("docx");
    expect(importKindFor("notes.md")).toBe("markdown");
    expect(importKindFor("notes.markdown")).toBe("markdown");
    expect(importKindFor("notes.txt")).toBe("text");
  });

  it("is case-insensitive", () => {
    expect(importKindFor("NOTES.DOCX")).toBe("docx");
  });

  it("handles a name containing dots", () => {
    expect(importKindFor("v1.2.final.docx")).toBe("docx");
  });

  // Mammoth cannot read the old binary .doc, and silently producing an empty
  // document would look like data loss.
  it("rejects legacy .doc rather than pretending to support it", () => {
    expect(importKindFor("old.doc")).toBeNull();
  });

  it("rejects unrelated formats and extensionless names", () => {
    expect(importKindFor("photo.png")).toBeNull();
    expect(importKindFor("README")).toBeNull();
  });
});

describe("escapeHtml", () => {
  it("escapes the three structural characters", () => {
    expect(escapeHtml('a < b & c > d')).toBe("a &lt; b &amp; c &gt; d");
  });

  it("leaves Hebrew alone", () => {
    expect(escapeHtml("עט הלב")).toBe("עט הלב");
  });
});

describe("markdownToHtml", () => {
  it("converts headings H1-H3", () => {
    expect(markdownToHtml("# כותרת")).toContain("<h1>כותרת</h1>");
    expect(markdownToHtml("## משנה")).toContain("<h2>משנה</h2>");
    expect(markdownToHtml("### תת")).toContain("<h3>תת</h3>");
  });

  it("converts paragraphs", () => {
    expect(markdownToHtml("שורה ראשונה")).toBe("<p>שורה ראשונה</p>");
  });

  it("converts bullet lists, closing them properly", () => {
    const html = markdownToHtml("- אחד\n- שתיים");
    expect(html).toContain("<ul>");
    expect(html).toContain("</ul>");
    expect((html.match(/<li>/g) ?? [])).toHaveLength(2);
  });

  it("converts numbered lists", () => {
    const html = markdownToHtml("1. אחד\n2. שתיים");
    expect(html).toContain("<ol>");
    expect(html).toContain("</ol>");
  });

  it("switches list type without nesting one inside the other", () => {
    const html = markdownToHtml("- א\n1. ב");
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("<ol>"));
  });

  it("closes a list when a paragraph follows", () => {
    const html = markdownToHtml("- א\n\nפסקה");
    expect(html.indexOf("</ul>")).toBeLessThan(html.indexOf("<p>פסקה</p>"));
  });

  it("converts blockquotes", () => {
    expect(markdownToHtml("> ציטוט")).toContain("<blockquote><p>ציטוט</p></blockquote>");
  });

  it("converts inline bold, italic and code", () => {
    expect(markdownToHtml("**מודגש**")).toContain("<strong>מודגש</strong>");
    expect(markdownToHtml("_נטוי_")).toContain("<em>נטוי</em>");
    expect(markdownToHtml("`קוד`")).toContain("<code>קוד</code>");
  });

  // The security property: imported files are untrusted input.
  it("escapes HTML in the source rather than passing it through", () => {
    const html = markdownToHtml("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes HTML inside a heading too", () => {
    expect(markdownToHtml("# <b>x</b>")).toContain("&lt;b&gt;");
  });

  it("handles CRLF line endings", () => {
    expect(markdownToHtml("# כותרת\r\n\r\nפסקה")).toContain("<h1>כותרת</h1>");
  });

  it("returns an empty string for empty input", () => {
    expect(markdownToHtml("")).toBe("");
    expect(markdownToHtml("\n\n")).toBe("");
  });
});

describe("textToHtml", () => {
  it("splits paragraphs on blank lines", () => {
    const html = textToHtml("אחת\n\nשתיים");
    expect((html.match(/<p>/g) ?? [])).toHaveLength(2);
  });

  it("keeps a single newline as a line break inside one paragraph", () => {
    expect(textToHtml("שורה\nשנייה")).toBe("<p>שורה<br>שנייה</p>");
  });

  it("escapes HTML", () => {
    expect(textToHtml("<b>x</b>")).toContain("&lt;b&gt;");
  });

  it("returns an empty paragraph rather than nothing for empty input", () => {
    expect(textToHtml("")).toBe("<p></p>");
    expect(textToHtml("   ")).toBe("<p></p>");
  });
});

describe("safeFilename", () => {
  it("keeps a normal Hebrew title", () => {
    expect(safeFilename("עט הלב", "md")).toBe("עט הלב.md");
  });

  it("strips characters that are illegal in filenames", () => {
    expect(safeFilename('a/b\\c:d*e?f"g<h>i|j', "docx")).not.toMatch(/[/\\?%*:|"<>]/);
  });

  // Windows rejects a name ending in a dot or space.
  it("trims a trailing dot or space", () => {
    expect(safeFilename("שם.", "md")).toBe("שם.md");
    expect(safeFilename("שם ", "md")).toBe("שם.md");
  });

  it("falls back for an empty or all-illegal title", () => {
    expect(safeFilename("", "md")).toBe("summary.md");
    expect(safeFilename("///", "md")).toBe("summary.md");
  });

  it("collapses runs of whitespace", () => {
    expect(safeFilename("א    ב", "md")).toBe("א ב.md");
  });
});
