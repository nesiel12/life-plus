// סורק כתב יד — the prompt for reading a photographed Hebrew page, and the
// deterministic cleanup of what the model returns.
//
// Pure and client-safe: no model call, no database. The route
// (app/api/torah/scan) normalises the image and calls Gemini Vision; every
// decision about *what the model is asked* and *what is done to its answer*
// lives here, where it is testable against strings (handwriting.test.ts).
//
// The central rule: this module never interprets. A model that expands ראשי
// תיבות, "fixes" a word it half-read, or translates a phrase produces text the
// learner did not write, in their own notebook. Cleanup here is limited to
// typography (gershayim, bullets, blank lines) and removing the model's own
// chatter.

import { hebrewRatio, normalizeHebrewPunctuation, stripForeignScript } from "@/lib/torah/hebrew";

/**
 * The marker the model is told to leave where it cannot read a word.
 *
 * A visible, countable marker rather than a guess: a page with four of these
 * is a page the learner should look over, and the UI can say so. Silent
 * guessing produces text that reads perfectly and is wrong.
 */
export const UNCERTAIN_MARK = "[?]";

export const HANDWRITING_SYSTEM_PROMPT = [
  "אתה מומחה לקריאת כתב יד עברי, ובפרט כתב יד תורני: כתב רהוט (סקריפט), כתב רש״י, וכתיבה מהירה של לומד בשיעור.",
  "המשימה: להעתיק לטקסט דיגיטלי את מה שכתוב בדף שצולם — בדיוק כפי שנכתב.",
  "",
  "כללי העתקה:",
  "• העתק אך ורק את מה שכתוב. אל תשלים, אל תתקן, אל תפרש ואל תוסיף מילה משלך.",
  "• שמור על ראשי תיבות כפי שנכתבו (רמב״ם, וכו׳, ע״פ, ז״ל, א״כ) — אל תפתח אותם.",
  "• כתוב גרשיים (״) בראשי תיבות וגרש (׳) בקיצור, בתווים העבריים הנכונים.",
  "• מספרים באותיות (גימטריה) כמו סימן ר״ה, דף ל״ג ע״א, פרק י״ב — השאר כפי שנכתבו.",
  "• מראי מקומות (מסכת, סימן, סעיף, פרק, פסוק) הם לרוב החלק החשוב בדף — דייק בהם במיוחד.",
  "• שמור על שורות הכתיבה כפי שהן: כותרת נשארת כותרת, רשימה נשארת רשימה, פסקה נשארת פסקה.",
  "",
  "פורמט הפלט — Markdown פשוט בעברית:",
  "• כותרת בדף → שורת כותרת (## כותרת).",
  "• פריטים ממוספרים או מסומנים → רשימה (- פריט, או 1. פריט).",
  "• הדגשה שסומנה בקו או בהקפה → **הדגשה**.",
  "• שורות ריקות בין פסקאות, בלי רווחים מיותרים.",
  "",
  `• מילה שאינך מצליח לקרוא → כתוב ${UNCERTAIN_MARK} במקומה. אל תנחש.`,
  "• אל תכתוב שום הקדמה, הסבר או סיכום — רק תוכן הדף.",
].join("\n");

/** The user-side prompt: how many pages, and anything the learner told us. */
export function handwritingPrompt(pageCount: number, hint?: string): string {
  const lines = [
    pageCount > 1
      ? `מצורפים ${pageCount} צילומים של דפים רצופים מאותו כתב יד. העתק את כולם לפי הסדר, כרצף אחד.`
      : "מצורף צילום של דף בכתב יד. העתק את מה שכתוב בו.",
  ];
  const cleanHint = hint?.trim();
  if (cleanHint) lines.push(`רקע שהלומד מסר על הדף: ${cleanHint}`);
  return lines.join("\n");
}

// Chatter a model prepends despite being told not to. Anchored to the start of
// the text and required to be a whole short line, so a legitimate first line
// that happens to contain "הטקסט" is never eaten.
const PREAMBLE = /^(?:הנה|להלן|זהו|זה)?\s*(?:ה?(?:טקסט|תמלול|העתקה|תוכן)\s*(?:מהתמונה|מהדף|של הדף|הבא)?)\s*:?\s*$/;

const ZERO_WIDTH = /[​-‍﻿]/g;
const FENCE = /^```[a-zA-Z]*\s*$/;
/** The marker as a pattern — every regex metacharacter escaped, brackets included. */
const UNCERTAIN_PATTERN = new RegExp(UNCERTAIN_MARK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");

/**
 * Cleans one model answer into the Markdown the review editor opens with.
 *
 * Every rule here is about typography or the model's own noise. None of it
 * changes a word the learner wrote.
 */
export function cleanScanMarkdown(raw: string): string {
  if (!raw) return "";

  let text = raw.replace(/\r\n?/g, "\n").replace(ZERO_WIDTH, "");
  // A stray Arabic or Cyrillic token inside Hebrew prose is model drift, and
  // it has been observed in this project before (lib/torah/hebrew.ts).
  text = stripForeignScript(text);
  text = normalizeHebrewPunctuation(text);

  const lines = text.split("\n").map((line) => line.replace(/[ \t]+$/g, ""));

  // Drop code fences the model wrapped the answer in.
  const unfenced = lines.filter((line) => !FENCE.test(line.trim()));

  // Drop a leading "הנה הטקסט:" line, and the blank lines around it.
  let start = 0;
  while (start < unfenced.length && unfenced[start].trim() === "") start++;
  if (start < unfenced.length && PREAMBLE.test(unfenced[start].trim())) {
    start++;
    while (start < unfenced.length && unfenced[start].trim() === "") start++;
  }

  const normalized = unfenced.slice(start).map((line) => {
    let out = line;
    // Bullets in whatever glyph the model chose → one Markdown bullet.
    out = out.replace(/^(\s*)[•·*‧▪◦]\s+/, "$1- ");
    out = out.replace(/^(\s*)[–—‑-]\s+/, "$1- ");
    // "##כותרת" → "## כותרת".
    out = out.replace(/^(\s*)(#{1,6})([^\s#])/, "$1$2 $3");
    // A numbered item written "1)" or "1." keeps its number, one space after.
    out = out.replace(/^(\s*)(\d+)[.)]\s+/, "$1$2. ");
    return out;
  });

  return normalized
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Several photographed pages as one document, in order. */
export function mergeScanPages(pages: readonly string[]): string {
  return pages
    .map((page) => cleanScanMarkdown(page))
    .filter((page) => page.length > 0)
    .join("\n\n");
}

/** How many words the model could not read. */
export function countUncertain(markdown: string): number {
  return markdown.split(UNCERTAIN_MARK).length - 1;
}

/**
 * The unreadable spots with their surrounding words, so the review step can
 * say "look here" instead of "something is wrong somewhere".
 */
export function uncertainSegments(markdown: string, context = 4): string[] {
  const out: string[] = [];
  const words = markdown.split(/\s+/);
  words.forEach((word, index) => {
    if (!word.includes(UNCERTAIN_MARK)) return;
    const from = Math.max(0, index - context);
    const to = Math.min(words.length, index + context + 1);
    out.push(words.slice(from, to).join(" "));
  });
  return out;
}

/**
 * A title for the note: the page's own heading if it has one, else its first
 * sentence, else a dated fallback. Never the whole first paragraph.
 */
export function suggestScanTitle(markdown: string, fallback = "דף מכתב היד"): string {
  const lines = markdown.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return fallback;

  const heading = lines.find((line) => /^#{1,6}\s+/.test(line));
  if (heading) return tidyTitle(heading.replace(/^#{1,6}\s+/, ""), fallback);

  const first = lines[0].replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "");
  const sentence = first.split(/(?<=[.!?׃])\s/)[0] ?? first;
  return tidyTitle(sentence, fallback);
}

function tidyTitle(candidate: string, fallback: string): string {
  const clean = candidate
    .replace(/\*\*/g, "")
    .replace(UNCERTAIN_PATTERN, "")
    .replace(/\s+/g, " ")
    .replace(/[.:،,]\s*$/, "")
    .trim();
  if (clean.length < 2) return fallback;
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  const space = cut.lastIndexOf(" ");
  return `${(space > 30 ? cut.slice(0, space) : cut).trim()}…`;
}

/** Hebrew letters only — an empty page or a photo of something else. */
export function isUsableScan(markdown: string): boolean {
  const letters = markdown.replace(UNCERTAIN_PATTERN, "").trim();
  return letters.length >= 12 && hebrewRatio(letters) >= 0.5;
}

export type ScanQualityLevel = "high" | "medium" | "low";

export interface ScanQuality {
  level: ScanQualityLevel;
  label: string;
  hint?: string;
}

/**
 * What to tell the learner about this reading, combining the model's own
 * confidence with how much it gave up on.
 *
 * The unreadable count outranks the confidence score: a model that says 0.9
 * while marking six words unreadable is not 90% right about this page.
 */
export function scanQuality(confidence: number | null | undefined, uncertainCount: number, markdown = ""): ScanQuality {
  const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
  const unreadableShare = words > 0 ? uncertainCount / words : 0;
  const score = confidence ?? 0.7;

  if (uncertainCount >= 6 || unreadableShare > 0.08 || score < 0.5) {
    return {
      level: "low",
      label: "קריאה חלקית",
      hint: uncertainCount > 0 ? `${uncertainCount} מילים לא נקראו. עבור עליהן מול הצילום לפני השמירה.` : "הכתב היה קשה לקריאה. כדאי לעבור על הטקסט מול הצילום.",
    };
  }
  if (uncertainCount > 0 || score < 0.8) {
    return {
      level: "medium",
      label: "קריאה טובה",
      hint: uncertainCount > 0 ? `${uncertainCount} מילים לא נקראו וסומנו ב־${UNCERTAIN_MARK}.` : "כדאי לעבור על מראי המקומות מול הצילום.",
    };
  }
  return { level: "high", label: "קריאה ברורה" };
}

// ---------------------------------------------------------------------------
// Markdown → the editor's HTML
// ---------------------------------------------------------------------------

/**
 * The scanned Markdown as the HTML the notes editor stores.
 *
 * A saved scan has to look like a note the learner typed — headings as
 * headings, lists as lists — not like raw "## " markup. Only the small subset
 * this module's own prompt asks for is converted, and every tag it emits is in
 * the allowlist of lib/summaries/sanitizeHtml.ts (which sanitises it again on
 * render regardless).
 *
 * Text is HTML-escaped BEFORE any markup is added: the source is a model
 * reading a photograph, and a page containing "<script>" must end up as those
 * characters on screen, not as a tag.
 */
export function scanMarkdownToHtml(markdown: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (value: string) =>
    escape(value)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, "<em>$1</em>");

  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.join("<br>")}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      html.push(`</${list}>`);
      list = null;
    }
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (line === "") {
      closeParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = Math.min(4, Math.max(2, heading[1].length));
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      closeParagraph();
      if (list !== "ul") {
        closeList();
        html.push("<ul>");
        list = "ul";
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      closeParagraph();
      if (list !== "ol") {
        closeList();
        html.push("<ol>");
        list = "ol";
      }
      html.push(`<li>${inline(numbered[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(inline(line));
  }

  closeParagraph();
  closeList();
  return html.join("");
}
