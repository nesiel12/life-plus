import { describe, expect, it } from "vitest";
import {
  HANDWRITING_SYSTEM_PROMPT,
  scanMarkdownToHtml,
  UNCERTAIN_MARK,
  cleanScanMarkdown,
  countUncertain,
  handwritingPrompt,
  isUsableScan,
  mergeScanPages,
  scanQuality,
  suggestScanTitle,
  uncertainSegments,
} from "@/lib/torah/handwriting";

describe("the prompt", () => {
  it("is Hebrew only — the model is never shown English to translate", () => {
    expect(HANDWRITING_SYSTEM_PROMPT.replace(/Markdown/g, "")).not.toMatch(/[A-Za-z]/);
  });

  it("forbids interpretation and demands the marker instead of a guess", () => {
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("אל תשלים, אל תתקן, אל תפרש");
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("אל תנחש");
    expect(HANDWRITING_SYSTEM_PROMPT).toContain(UNCERTAIN_MARK);
  });

  it("names the Hebrew specifics: ראשי תיבות, gershayim, gematria, mareh mekomot", () => {
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("ראשי תיבות");
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("גרשיים");
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("גימטריה");
    expect(HANDWRITING_SYSTEM_PROMPT).toContain("מראי מקומות");
  });

  it("tells the model how many pages it is reading, and passes the learner's hint", () => {
    expect(handwritingPrompt(1)).toContain("מצורף צילום של דף");
    expect(handwritingPrompt(3)).toContain("3 צילומים");
    expect(handwritingPrompt(1, "  שיעור על הלכות שבת  ")).toContain("שיעור על הלכות שבת");
    expect(handwritingPrompt(1, "   ")).not.toContain("רקע שהלומד מסר");
  });
});

describe("cleanScanMarkdown", () => {
  it("returns an empty string for nothing", () => {
    expect(cleanScanMarkdown("")).toBe("");
    expect(cleanScanMarkdown("   \n\n  ")).toBe("");
  });

  it("strips a leading 'here is the text' line and the blank line after it", () => {
    expect(cleanScanMarkdown("הנה הטקסט מהתמונה:\n\nכלי שמלאכתו לאיסור")).toBe("כלי שמלאכתו לאיסור");
    expect(cleanScanMarkdown("להלן התמלול\nשורה ראשונה")).toBe("שורה ראשונה");
  });

  it("keeps a first line that merely mentions the word, because it is content", () => {
    const text = "הטקסט של הרמב״ם בהלכות שבת עוסק במוקצה";
    expect(cleanScanMarkdown(text)).toBe(text);
  });

  it("removes code fences the model wrapped the answer in", () => {
    expect(cleanScanMarkdown("```markdown\n## כותרת\nגוף\n```")).toBe("## כותרת\nגוף");
  });

  it("normalises every bullet glyph to one Markdown bullet", () => {
    expect(cleanScanMarkdown("• ראשון\n* שני\n– שלישי\n- רביעי")).toBe("- ראשון\n- שני\n- שלישי\n- רביעי");
  });

  it("keeps numbered lists numbered, with one space", () => {
    expect(cleanScanMarkdown("1)   ראשון\n2.שני")).toBe("1. ראשון\n2.שני");
  });

  it("puts a space after a heading's hashes", () => {
    expect(cleanScanMarkdown("##כותרת הדף")).toBe("## כותרת הדף");
  });

  it("collapses runs of blank lines and trailing spaces", () => {
    expect(cleanScanMarkdown("פסקה   \n\n\n\nפסקה שנייה")).toBe("פסקה\n\nפסקה שנייה");
  });

  it("writes gershayim and geresh in their Hebrew characters", () => {
    expect(cleanScanMarkdown('רמב"ם הלכות שבת')).toBe("רמב״ם הלכות שבת");
    expect(cleanScanMarkdown("סימן ר'")).toBe("סימן ר׳");
  });

  it("removes foreign-script drift but keeps Latin, which belongs in a note", () => {
    expect(cleanScanMarkdown("הלכות שבת مرحبا ומוקצה")).toBe("הלכות שבת ומוקצה");
    expect(cleanScanMarkdown("ראה PDF בעמוד 4")).toBe("ראה PDF בעמוד 4");
  });

  it("strips zero-width characters and normalises CRLF", () => {
    expect(cleanScanMarkdown("שורה​ראשונה\r\nשורה שנייה")).toBe("שורהראשונה\nשורה שנייה");
  });

  it("never touches the uncertainty markers", () => {
    expect(cleanScanMarkdown(`כלי ${UNCERTAIN_MARK} לאיסור`)).toBe(`כלי ${UNCERTAIN_MARK} לאיסור`);
  });
});

describe("mergeScanPages", () => {
  it("joins pages in order and cleans each one", () => {
    expect(mergeScanPages(["הנה הטקסט:\nעמוד ראשון", "• עמוד שני"])).toBe("עמוד ראשון\n\n- עמוד שני");
  });

  it("drops pages that came back empty", () => {
    expect(mergeScanPages(["עמוד ראשון", "   ", ""])).toBe("עמוד ראשון");
  });
});

describe("uncertainty", () => {
  const text = `כלי ${UNCERTAIN_MARK} לאיסור מותר לצורך גופו ${UNCERTAIN_MARK} ומקומו`;

  it("counts the markers", () => {
    expect(countUncertain(text)).toBe(2);
    expect(countUncertain("בלי סימונים")).toBe(0);
  });

  it("returns each unreadable spot with its surrounding words", () => {
    const segments = uncertainSegments(text, 2);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe(`כלי ${UNCERTAIN_MARK} לאיסור מותר`);
    expect(segments[1]).toContain("ומקומו");
  });
});

describe("suggestScanTitle", () => {
  it("prefers the page's own heading", () => {
    expect(suggestScanTitle("## דיני מוקצה בשבת\n\nכלי שמלאכתו לאיסור")).toBe("דיני מוקצה בשבת");
  });

  it("falls back to the first sentence, without list markers", () => {
    expect(suggestScanTitle("- כלי שמלאכתו לאיסור מותר. ועוד דבר")).toBe("כלי שמלאכתו לאיסור מותר");
  });

  it("clips a long first sentence at a word boundary", () => {
    const title = suggestScanTitle(`${"מילה ".repeat(40)}`);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
  });

  it("drops emphasis and uncertainty markers from the title", () => {
    expect(suggestScanTitle(`## **דיני** ${UNCERTAIN_MARK} מוקצה`)).toBe("דיני מוקצה");
  });

  it("uses the fallback for an empty or unusable page", () => {
    expect(suggestScanTitle("")).toBe("דף מכתב היד");
    expect(suggestScanTitle("#  \n", "ברירת מחדל")).toBe("ברירת מחדל");
  });
});

describe("isUsableScan", () => {
  it("accepts a real Hebrew page", () => {
    expect(isUsableScan("כלי שמלאכתו לאיסור מותר לטלטלו")).toBe(true);
  });

  it("rejects an empty page, a scrap, and a page that is not Hebrew", () => {
    expect(isUsableScan("")).toBe(false);
    expect(isUsableScan("אב")).toBe(false);
    expect(isUsableScan("This is an English page of notes")).toBe(false);
  });

  it("does not count the markers as content", () => {
    expect(isUsableScan(`${UNCERTAIN_MARK} ${UNCERTAIN_MARK} ${UNCERTAIN_MARK}`)).toBe(false);
  });
});

describe("scanQuality", () => {
  const page = "מילה ".repeat(100);

  it("is high only when the model is confident and read everything", () => {
    const quality = scanQuality(0.95, 0, page);
    expect(quality.level).toBe("high");
    expect(quality.hint).toBeUndefined();
  });

  it("is medium when a word or two were missed", () => {
    expect(scanQuality(0.9, 2, page).level).toBe("medium");
    expect(scanQuality(0.6, 0, page).level).toBe("medium");
  });

  it("is low when many words were missed, whatever the model claims", () => {
    const quality = scanQuality(0.95, 6, page);
    expect(quality.level).toBe("low");
    expect(quality.hint).toContain("6 מילים");
  });

  it("is low when unreadable words are a large share of a short page", () => {
    expect(scanQuality(0.9, 2, "מילה מילה מילה מילה מילה").level).toBe("low");
  });

  it("is low on a low confidence score alone", () => {
    expect(scanQuality(0.3, 0, page).level).toBe("low");
  });

  it("assumes a middling score when the model reported none", () => {
    expect(scanQuality(null, 0, page).level).toBe("medium");
  });
});

describe("scanMarkdownToHtml", () => {
  it("turns headings, lists and paragraphs into the editor's own tags", () => {
    const html = scanMarkdownToHtml("## דיני מוקצה\n\n- ראשון\n- שני\n\nפסקה רגילה");
    expect(html).toBe("<h2>דיני מוקצה</h2><ul><li>ראשון</li><li>שני</li></ul><p>פסקה רגילה</p>");
  });

  it("keeps numbered lists ordered", () => {
    expect(scanMarkdownToHtml("1. ראשון\n2. שני")).toBe("<ol><li>ראשון</li><li>שני</li></ol>");
  });

  it("renders emphasis", () => {
    expect(scanMarkdownToHtml("**חשוב** מאוד")).toBe("<p><strong>חשוב</strong> מאוד</p>");
  });

  it("joins the lines of one paragraph with breaks", () => {
    expect(scanMarkdownToHtml("שורה ראשונה\nשורה שנייה")).toBe("<p>שורה ראשונה<br>שורה שנייה</p>");
  });

  it("escapes HTML before adding any of its own — a photographed page is untrusted text", () => {
    expect(scanMarkdownToHtml("<script>alert(1)</script>")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(scanMarkdownToHtml("רמב״ם & רש״י")).toBe("<p>רמב״ם &amp; רש״י</p>");
  });

  it("closes every list and paragraph it opens", () => {
    const html = scanMarkdownToHtml("- פריט\nפסקה\n## כותרת");
    expect(html).toBe("<ul><li>פריט</li></ul><p>פסקה</p><h2>כותרת</h2>");
  });

  it("is empty for an empty page", () => {
    expect(scanMarkdownToHtml("")).toBe("");
  });
});
