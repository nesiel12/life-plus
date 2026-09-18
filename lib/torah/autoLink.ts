// Auto-linking book names inside personal notes.
//
// Writing "כמו שפוסק השולחן ערוך" in a summary turns "השולחן ערוך" into a link
// to that sefer's page — to the row in the user's library when it is there,
// and to the open-or-create resolver when it is only in the catalogue.
//
// RENDER-TIME, NOT SAVE-TIME. The stored note is never rewritten: links are
// computed when the note is displayed. That keeps the user's own text exactly
// as they wrote it, makes a newly added book light up in every old note
// automatically, and means a deleted book simply stops being a link instead
// of leaving a dead anchor baked into the HTML.
//
// Pure and DOM-free, so it runs identically during SSR and is testable
// against plain strings (autoLink.test.ts).

import { bookTitleKey } from "@/lib/torah/hebrew";
import type { CatalogSefer } from "@/lib/torah/seforimCatalog";

export interface AutoLinkTarget {
  /** The surface form to find in the text. */
  label: string;
  /** Title to open when the book is not in the library yet. */
  title: string;
  /** The library row, when there is one. */
  bookId?: string;
}

export type LinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; target: AutoLinkTarget };

interface LibraryBookLike {
  id: string;
  title: string;
  hebrewTitle?: string;
}

// Shorter than this and a "title" is a common word ("תורה", "חסד") that would
// light up half of every note. Abbreviations written with gershayim ("שו״ע")
// are exempt: the quote mark itself makes them unambiguous, and the pattern
// requires it, so a bare "שוע" never matches.
const MIN_LABEL_LENGTH = 4;
const ABBREVIATION = /["'׳״]/;

/**
 * Every label worth matching, library first.
 *
 * A library book and a catalogue entry with the same title collapse to the
 * library row, so the link goes to the user's own copy — with their notes on
 * it — rather than creating a duplicate.
 */
export function buildAutoLinkTargets(
  books: LibraryBookLike[],
  catalog: CatalogSefer[],
  options: { excludeBookId?: string } = {}
): AutoLinkTarget[] {
  const byKey = new Map<string, AutoLinkTarget>();

  function add(label: string | undefined, target: Omit<AutoLinkTarget, "label">) {
    const trimmed = label?.trim();
    if (!trimmed) return;
    const key = bookTitleKey(trimmed);
    const tooShort = key.length < MIN_LABEL_LENGTH && !(ABBREVIATION.test(trimmed) && key.length >= 2);
    if (tooShort || byKey.has(key)) return;
    byKey.set(key, { label: trimmed, ...target });
  }

  for (const book of books) {
    if (book.id === options.excludeBookId) continue;
    const title = book.hebrewTitle ?? book.title;
    add(book.hebrewTitle, { title, bookId: book.id });
    add(book.title, { title, bookId: book.id });
  }

  // Catalogue entries whose title matches an excluded library book (the page
  // the note is on) are skipped too: a note on the Mishna Berura page linking
  // "משנה ברורה" back to itself is noise.
  const excluded = books.find((b) => b.id === options.excludeBookId);
  const excludedKeys = new Set(
    [excluded?.title, excluded?.hebrewTitle].filter(Boolean).map((t) => bookTitleKey(t as string))
  );

  for (const sefer of catalog) {
    if (excludedKeys.has(bookTitleKey(sefer.title))) continue;
    const libraryMatch = books.find(
      (b) => b.id !== options.excludeBookId && [b.title, b.hebrewTitle].some((t) => t && bookTitleKey(t) === bookTitleKey(sefer.title))
    );
    const target = libraryMatch
      ? { title: libraryMatch.hebrewTitle ?? libraryMatch.title, bookId: libraryMatch.id }
      : { title: sefer.title };
    add(sefer.title, target);
    for (const alias of sefer.aliases ?? []) add(alias, target);
  }

  return [...byKey.values()];
}

const QUOTE_CLASS = `(?:["'׳״\`]|&quot;|&#39;|&#x27;)`;
const HEBREW_OR_LATIN = "\\u05D0-\\u05EAA-Za-z";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * One label as a pattern tolerant of how people actually type it: any
 * geresh/gershayim/quote form (and its HTML-escaped form), and any run of
 * whitespace between words.
 */
function labelPattern(label: string): string {
  return label
    .split(/\s+/)
    .map((word) =>
      word
        .split(/["'׳״`]/)
        .map(escapeRegex)
        .join(QUOTE_CLASS)
    )
    .join("\\s+");
}

interface Matcher {
  regex: RegExp;
  targetsByKey: Map<string, AutoLinkTarget>;
}

function buildMatcher(targets: AutoLinkTarget[]): Matcher | null {
  if (targets.length === 0) return null;
  // Longest first, so "קיצור שולחן ערוך" wins over "שולחן ערוך" inside it.
  const sorted = [...targets].sort((a, b) => b.label.length - a.label.length);
  const alternation = sorted.map((t) => labelPattern(t.label)).join("|");
  // A Hebrew word can carry up to three prefix letters (ו, ה, ב, ל, כ, מ, ש)
  // — "ובשולחן ערוך" is still the Shulchan Aruch — but the match must start at
  // a word boundary and must not run into a following letter, or "ערוכים"
  // would link as "ערוך".
  const regex = new RegExp(
    `(?<![${HEBREW_OR_LATIN}])([ובהלכמש]{0,3})(${alternation})(?![${HEBREW_OR_LATIN}])`,
    "g"
  );
  const targetsByKey = new Map(sorted.map((t) => [bookTitleKey(t.label), t]));
  return { regex, targetsByKey };
}

function decodeQuotes(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'");
}

/**
 * Splits plain text into text and link segments.
 *
 * Each book is linked at its first occurrence only — the way an encyclopedia
 * links a term — so a note that names the Shulchan Aruch ten times reads as
 * prose with one link, not a wall of underlines.
 */
export function linkifyText(text: string, targets: AutoLinkTarget[]): LinkSegment[] {
  return linkifyWith(buildMatcher(targets), text, new Set());
}

function linkifyWith(matcher: Matcher | null, text: string, linked: Set<string>): LinkSegment[] {
  if (!matcher || !text) return [{ kind: "text", text }];

  const segments: LinkSegment[] = [];
  let cursor = 0;
  matcher.regex.lastIndex = 0;

  for (const match of text.matchAll(matcher.regex)) {
    const prefix = match[1] ?? "";
    const surface = match[2] ?? "";
    // With a prefix like ה, "השולחן ערוך" can match both as prefix+label and
    // as an alias label that already includes the ה. Either way the target is
    // looked up by folded key, trying the surface with and without prefix.
    const target =
      matcher.targetsByKey.get(bookTitleKey(decodeQuotes(surface))) ??
      matcher.targetsByKey.get(bookTitleKey(decodeQuotes(prefix + surface)));
    if (!target) continue;

    const identity = target.bookId ?? `title:${bookTitleKey(target.title)}`;
    if (linked.has(identity)) continue;
    linked.add(identity);

    const start = (match.index ?? 0) + prefix.length;
    if (start > cursor) segments.push({ kind: "text", text: text.slice(cursor, start) });
    segments.push({ kind: "link", text: surface, target });
    cursor = start + surface.length;
  }

  if (cursor < text.length) segments.push({ kind: "text", text: text.slice(cursor) });
  return segments.length > 0 ? segments : [{ kind: "text", text }];
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Elements whose text must never be linkified: an existing link, an @mention
// chip (already a link), and code.
const SKIP_OPEN = /^<(a|code|pre)\b|^<span\b[^>]*\bentity-mention\b/i;

/**
 * Linkifies the text nodes of sanitised summary HTML.
 *
 * A tokenizer over tags, not a DOM parse: this runs during SSR where there is
 * no DOMParser, and the input is the sanitiser's narrow output (see
 * lib/summaries/sanitizeHtml.ts), not arbitrary markup. Text inside an anchor,
 * a mention chip or code is left alone.
 */
export function linkifyHtml(html: string, targets: AutoLinkTarget[]): string {
  if (!html || targets.length === 0) return html;

  const matcher = buildMatcher(targets);
  const linked = new Set<string>();
  const tokens = html.split(/(<[^>]+>)/);
  const skipStack: string[] = [];
  let out = "";

  for (const token of tokens) {
    if (token.startsWith("<")) {
      const open = SKIP_OPEN.exec(token);
      if (open && !token.endsWith("/>")) {
        skipStack.push((open[1] ?? "span").toLowerCase());
      } else if (skipStack.length > 0) {
        const close = /^<\/(\w+)/.exec(token);
        const top = skipStack[skipStack.length - 1];
        if (close && close[1].toLowerCase() === top) skipStack.pop();
        else if (!close && /^<(a|code|pre|span)\b/i.test(token) && !token.endsWith("/>")) {
          // A nested element of the same kind inside a skipped one keeps the
          // stack balanced.
          skipStack.push(/^<(\w+)/.exec(token)![1].toLowerCase());
        }
      }
      out += token;
      continue;
    }

    if (skipStack.length > 0 || !token) {
      out += token;
      continue;
    }

    for (const segment of linkifyWith(matcher, token, linked)) {
      if (segment.kind === "text") {
        out += segment.text;
      } else {
        const { target } = segment;
        const data = target.bookId
          ? `data-auto-book-id="${escapeAttribute(target.bookId)}"`
          : `data-auto-book-title="${escapeAttribute(target.title)}"`;
        out += `<span class="auto-book-link" role="link" tabindex="0" ${data}>${segment.text}</span>`;
      }
    }
  }

  return out;
}
