import { describe, expect, it } from "vitest";
import { clampKeyParagraphs, paragraphsFromHtml } from "@/lib/learning/articleExtract";

describe("paragraphsFromHtml", () => {
  it("extracts paragraph, list, heading, and blockquote text in document order", () => {
    const html = `
      <h1>${"כותרת ראשית שמספיק ארוכה כדי לעבור את הסינון של הפונקציה".repeat(1)}</h1>
      <p>${"פסקה ראשונה עם תוכן ממשי שמספיק ארוך כדי להיחשב פסקה אמיתית ולא רעש.".repeat(1)}</p>
      <li>${"פריט רשימה שגם הוא ארוך מספיק כדי להיחשב תוכן משמעותי בעמוד.".repeat(1)}</li>
      <blockquote>${"ציטוט ארוך מספיק שגם הוא אמור להיכלל בתוצאה הסופית של הפירוק.".repeat(1)}</blockquote>
    `;
    const result = paragraphsFromHtml(html);
    expect(result).toHaveLength(4);
    expect(result[0]).toContain("כותרת ראשית");
    expect(result[1]).toContain("פסקה ראשונה");
    expect(result[2]).toContain("פריט רשימה");
    expect(result[3]).toContain("ציטוט");
  });

  it("drops fragments shorter than the minimum length", () => {
    const html = `<p>קצר</p><p>${"פסקה אמיתית שארוכה מספיק כדי לעבור את סף האורך המינימלי שנקבע.".repeat(1)}</p>`;
    expect(paragraphsFromHtml(html)).toHaveLength(1);
  });

  it("returns an empty array for content with no qualifying blocks", () => {
    expect(paragraphsFromHtml("<div>just a div, no p/li/h/blockquote</div>")).toEqual([]);
  });
});

describe("clampKeyParagraphs", () => {
  const paragraphs = ["a", "b", "c"];

  it("keeps in-range picks with their notes", () => {
    expect(clampKeyParagraphs(paragraphs, [{ index: 1, note: "חשוב" }])).toEqual({
      indices: [1],
      notes: { 1: "חשוב" },
    });
  });

  it("drops out-of-range indices instead of throwing", () => {
    expect(clampKeyParagraphs(paragraphs, [{ index: -1, note: "x" }, { index: 99, note: "y" }])).toEqual({
      indices: [],
      notes: {},
    });
  });

  it("dedupes a repeated index, keeping the first note", () => {
    expect(clampKeyParagraphs(paragraphs, [{ index: 0, note: "first" }, { index: 0, note: "second" }])).toEqual({
      indices: [0],
      notes: { 0: "first" },
    });
  });

  it("returns empty when nothing was picked", () => {
    expect(clampKeyParagraphs(paragraphs, [])).toEqual({ indices: [], notes: {} });
  });
});
