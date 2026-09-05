import { parseHebrewEvent } from "@/lib/calendar/parseHebrewEvent";

// The Intention-to-Execution engine.
//
// Turns a free-text daily intention into concrete items. "היום אני רוצה
// לסיים את הדוח, לקבוע פגישה עם דנה ב-14:00, ולהתקשר לאמא" should produce
// two tasks and one timed calendar block, not a paragraph the user has to
// re-enter by hand.
//
// Deterministic, not AI. Three reasons this is the right call here rather
// than a model call:
//   1. It runs on every submit, and a 3-second round trip would make the
//      input feel broken.
//   2. It has to work when the AI providers are down — the same reasoning
//      behind lib/calendar/parseHebrewEvent.ts, which this builds on.
//   3. Splitting a sentence on connectives is a job regex does exactly and
//      a model does approximately.
//
// The safety rule throughout: never invent. A fragment with an explicit
// time becomes a scheduled block; a fragment without one becomes an undated
// task. Nothing is assigned an hour it did not state, because a wrongly
// scheduled block is only discovered by missing it.

export interface ParsedTask {
  kind: "task";
  title: string;
}

export interface ParsedBlock {
  kind: "block";
  title: string;
  /** Local wall clock, "YYYY-MM-DDTHH:MM". */
  start: string;
  durationMinutes: number;
}

export type ParsedIntentionItem = ParsedTask | ParsedBlock;

export interface ParsedIntention {
  items: ParsedIntentionItem[];
  /** Fragments that produced nothing — surfaced so the user can see what
   *  was ignored rather than silently losing half their sentence. */
  unparsed: string[];
}

// Splits on real separators only: commas, semicolons, newlines, bullets, and
// the Hebrew "ו" conjunction *only* when it opens an infinitive verb
// ("ולהתקשר"). A bare "ו" prefix is far more often part of a word than a
// list separator, and splitting on it indiscriminately shreds normal text.
const SEPARATOR = /[,;\n•]+|\sו(?=ל[א-ת])/g;

// Openers that introduce the list rather than belonging to any item.
const LEAD_INS = [
  /^היום אני (?:רוצה|צריך|מתכוון) ל?/,
  /^אני (?:רוצה|צריך|מתכוון) ל?/,
  /^היום\s+/,
  /^המטרה שלי היום היא ל?/,
  /^צריך ל?/,
];

const NOISE_WORDS = new Set(["גם", "וגם", "אז", "כן", "בנוסף"]);

function cleanFragment(raw: string): string {
  let text = raw.trim();
  for (const pattern of LEAD_INS) text = text.replace(pattern, "").trim();
  text = text
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word))
    .join(" ");
  // A dangling conjunction left by the split.
  return text.replace(/^ו(?=[א-ת])/, "").trim();
}

/** Fragments this short are punctuation artefacts, not intentions. */
const MIN_ITEM_CHARS = 2;

export function parseIntention(text: string, now: Date): ParsedIntention {
  const clean = text.trim();
  if (!clean) return { items: [], unparsed: [] };

  const fragments = clean
    .split(SEPARATOR)
    .map(cleanFragment)
    .filter((f) => f.length >= MIN_ITEM_CHARS);

  const items: ParsedIntentionItem[] = [];
  const unparsed: string[] = [];
  const seen = new Set<string>();

  for (const fragment of fragments) {
    // parseHebrewEvent returns null unless it finds an explicit clock time,
    // which is exactly the task/block distinction — reusing it means the two
    // features can never disagree about what counts as "a scheduled thing".
    const event = parseHebrewEvent(fragment, now);

    if (event) {
      const key = `block:${event.title}:${event.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        kind: "block",
        title: event.title,
        start: event.start,
        durationMinutes: event.durationMinutes,
      });
      continue;
    }

    const title = fragment;
    // A fragment that is only a time reference with nothing to do isn't a
    // task — it's leftover scaffolding.
    if (/^(מחר|היום|מחרתיים|בערב|בבוקר|אחה"צ|אחה״צ)$/.test(title)) {
      unparsed.push(fragment);
      continue;
    }

    const key = `task:${title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind: "task", title });
  }

  return { items, unparsed };
}

/** Convenience splits for the caller, which writes each kind differently. */
export function tasksFrom(parsed: ParsedIntention): ParsedTask[] {
  return parsed.items.filter((i): i is ParsedTask => i.kind === "task");
}

export function blocksFrom(parsed: ParsedIntention): ParsedBlock[] {
  return parsed.items.filter((i): i is ParsedBlock => i.kind === "block");
}
