import { describe, expect, it } from "vitest";
import { sanitizeSummaryHtml } from "@/lib/summaries/sanitizeHtml";

describe("sanitizeSummaryHtml", () => {
  describe("keeps everything the editor legitimately produces", () => {
    const allowed = [
      "<p>פסקה</p>",
      "<h1>כותרת</h1>",
      "<h2>משנה</h2>",
      "<h3>תת</h3>",
      "<strong>מודגש</strong>",
      "<em>נטוי</em>",
      "<ul><li><p>פריט</p></li></ul>",
      "<ol><li><p>פריט</p></li></ol>",
      "<blockquote><p>ציטוט</p></blockquote>",
      "<code>קוד</code>",
    ];
    for (const html of allowed) {
      it(`keeps ${html.slice(0, 24)}`, () => {
        expect(sanitizeSummaryHtml(html)).toBe(html);
      });
    }

    it("keeps a full table", () => {
      const table = "<table><thead><tr><th>א</th></tr></thead><tbody><tr><td>ב</td></tr></tbody></table>";
      expect(sanitizeSummaryHtml(table)).toBe(table);
    });

    it("keeps colspan and rowspan", () => {
      expect(sanitizeSummaryHtml('<td colspan="2">x</td>')).toContain('colspan="2"');
    });

    it("keeps a mention chip with all three data attributes", () => {
      const chip =
        '<span class="entity-mention" data-entity-type="book" data-entity-id="b1" data-label="עט הלב">@עט הלב</span>';
      const out = sanitizeSummaryHtml(chip);
      expect(out).toContain('data-entity-type="book"');
      expect(out).toContain('data-entity-id="b1"');
      expect(out).toContain('data-label="עט הלב"');
      expect(out).toContain('class="entity-mention"');
    });
  });

  describe("strips anything that can execute", () => {
    // Removing the tag but keeping the body would leave the code visible as
    // text — and for <style>, still affecting the page.
    it("removes a script element and its contents entirely", () => {
      const out = sanitizeSummaryHtml("<p>לפני</p><script>alert(1)</script><p>אחרי</p>");
      expect(out).not.toContain("script");
      expect(out).not.toContain("alert(1)");
      expect(out).toContain("לפני");
      expect(out).toContain("אחרי");
    });

    it("removes style, iframe, object and embed with their contents", () => {
      expect(sanitizeSummaryHtml("<style>body{display:none}</style>")).not.toContain("display:none");
      expect(sanitizeSummaryHtml("<iframe src='evil'></iframe>")).toBe("");
      expect(sanitizeSummaryHtml("<object data='evil'></object>")).toBe("");
      expect(sanitizeSummaryHtml("<embed src='evil'>")).toBe("");
    });

    it("strips inline event handlers", () => {
      const out = sanitizeSummaryHtml('<p onclick="alert(1)">טקסט</p>');
      expect(out).toBe("<p>טקסט</p>");
      expect(out).not.toContain("onclick");
    });

    it("strips every on* handler variant, including uppercase", () => {
      const out = sanitizeSummaryHtml('<p OnMouseOver="x" onerror="y" onload="z">t</p>');
      expect(out).toBe("<p>t</p>");
    });

    it("strips style attributes", () => {
      expect(sanitizeSummaryHtml('<p style="position:fixed;inset:0">t</p>')).toBe("<p>t</p>");
    });

    it("drops an anchor entirely, href and all", () => {
      const out = sanitizeSummaryHtml('<a href="javascript:alert(1)">click</a>');
      expect(out).not.toContain("href");
      expect(out).not.toContain("javascript:");
      // Text survives; only the element is removed.
      expect(out).toContain("click");
    });

    it("drops img, so no src can fire onerror", () => {
      expect(sanitizeSummaryHtml('<img src=x onerror="alert(1)">')).toBe("");
    });

    it("removes HTML comments", () => {
      expect(sanitizeSummaryHtml("<p>a</p><!-- [if IE]><script>x</script><![endif] -->")).toBe("<p>a</p>");
    });

    it("rejects an unknown class rather than passing it through", () => {
      expect(sanitizeSummaryHtml('<span class="fixed inset-0 z-50">x</span>')).toBe("<span>x</span>");
    });

    it("rejects a javascript: value even on an allowed attribute", () => {
      expect(sanitizeSummaryHtml('<span data-label="javascript:alert(1)">x</span>')).not.toContain("javascript:");
    });
  });

  describe("odd input", () => {
    it("handles empty input", () => {
      expect(sanitizeSummaryHtml("")).toBe("");
    });

    it("leaves plain text untouched", () => {
      expect(sanitizeSummaryHtml("סתם טקסט")).toBe("סתם טקסט");
    });

    it("is idempotent", () => {
      const once = sanitizeSummaryHtml('<p onclick="x">t</p><script>y</script>');
      expect(sanitizeSummaryHtml(once)).toBe(once);
    });

    it("does not choke on an unclosed tag", () => {
      expect(() => sanitizeSummaryHtml("<p>unclosed")).not.toThrow();
    });
  });
});
