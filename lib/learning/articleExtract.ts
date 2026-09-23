import "server-only";
import { JSDOM } from "jsdom";

// Pure helpers behind app/api/learning/article/extract/route.ts, split out
// so the actual text-processing logic is unit-testable without a network
// fetch or an AI call — the route itself is thin: fetch → Readability →
// these two functions → one generateStructuredData call → cache.

const MIN_PARAGRAPH_CHARS = 40;
const BLOCK_SELECTOR = "p, li, h1, h2, h3, blockquote";

/**
 * Turns Readability's cleaned article HTML into an ordered list of
 * paragraph-sized text blocks — what gets rendered, numbered, and handed to
 * the AI for key-paragraph picking. Very short fragments (a lone "Photo:"
 * caption, an empty heading) are dropped; they're noise a reader doesn't
 * need and would only tempt the model into picking one as "key" for lack of
 * anything better on the page.
 */
export function paragraphsFromHtml(html: string): string[] {
  const dom = new JSDOM(`<body>${html}</body>`);
  const blocks = dom.window.document.querySelectorAll(BLOCK_SELECTOR);
  const paragraphs: string[] = [];
  for (const el of blocks) {
    const text = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length >= MIN_PARAGRAPH_CHARS) paragraphs.push(text);
  }
  return paragraphs;
}

export interface KeyParagraphPick {
  index: number;
  note: string;
}

export interface ClampedKeyParagraphs {
  indices: number[];
  notes: Record<number, string>;
}

/**
 * The model is handed a numbered list and asked to pick from it, but
 * nothing guarantees the indices it returns actually exist — a short
 * article, a miscount, or a slightly-too-creative response can all produce
 * an out-of-range or duplicate index. Filtered here rather than trusted
 * as-is, so a bad pick degrades to "fewer highlights" instead of a broken
 * render reaching for `paragraphs[999]`.
 */
export function clampKeyParagraphs(paragraphs: readonly string[], picks: readonly KeyParagraphPick[]): ClampedKeyParagraphs {
  const seen = new Set<number>();
  const indices: number[] = [];
  const notes: Record<number, string> = {};
  for (const pick of picks) {
    if (pick.index < 0 || pick.index >= paragraphs.length) continue;
    if (seen.has(pick.index)) continue;
    seen.add(pick.index);
    indices.push(pick.index);
    notes[pick.index] = pick.note;
  }
  return { indices, notes };
}
