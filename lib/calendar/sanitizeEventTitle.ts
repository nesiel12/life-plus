// Event-title hygiene for the Smart Calendar.
//
// Why this exists: CalendarAgent (lib/ai/agents/calendarAgent.ts) writes a
// model-generated `title` straight into the user's real Google Calendar, and
// a structured-output model occasionally emits a mangled Hebrew string — a
// stray Latin token fused onto a Hebrew word, a segment repeated after a
// slash, or an invisible bidi control character that scrambles how the whole
// line renders. Once written, that garbage is in the user's actual calendar,
// so this cleans at both boundaries: before a title is proposed/created, and
// again when events are read back (titles written before this existed, or by
// anything else, are still garbled otherwise).
//
// The hard constraint shaping every rule below: NEVER destroy a legitimate
// title. "פגישה עם John", "Zoom עם דנה", "סקירת Q4" are all real, valid
// titles a person would type, and each must come through untouched. That
// rules out anything as blunt as "strip Latin characters from Hebrew text".

// Unicode format/invisible characters. Bidi overrides (U+202A–U+202E,
// U+2066–U+2069, U+200E/F, U+061C) are the actual cause of "the text looks
// scrambled but the string looks fine in the DB" — they reorder rendering
// without changing content. Zero-width characters (U+200B–U+200D, U+FEFF)
// are invisible and break word matching. Neither ever belongs in a title.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u061C\uFEFF]/g;

// C0/C1 control characters, except the whitespace we normalize below.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const HEBREW = "\u0590-\u05FF";

/**
 * Hebrew and Latin are separate scripts that never join: a person writing a
 * mixed title always separates them with a space or punctuation. A Latin run
 * fused directly to a Hebrew letter with no separator is therefore corruption,
 * not content — which is exactly the "צורייםceils" shape. Space-separated
 * Latin is left completely alone.
 *
 * Capture-group replacement rather than lookbehind: equivalent here, and
 * avoids relying on lookbehind support in every runtime this may execute in.
 */
function stripFusedLatin(value: string): string {
  return value
    .replace(new RegExp(`([${HEBREW}])[A-Za-z]+`, "g"), "$1")
    .replace(new RegExp(`[A-Za-z]+([${HEBREW}])`, "g"), "$1");
}

/** "צוריים צוריים" -> "צוריים". Immediate repetition of the same word is
 *  never intentional in a calendar title. */
function collapseRepeatedWords(value: string): string {
  return value.replace(/(\S+)(\s+\1)+/g, "$1");
}

/**
 * Drops a slash-separated segment that adds nothing — the "/צוריים" in
 * "פגישה עם צוריים/צוריים", which repeats what an earlier segment already
 * said. A segment carrying genuinely new text ("פגישה/שיחה") is kept: the
 * test is containment against what's already been retained, not mere
 * presence of a slash.
 */
function dropRedundantSegments(value: string): string {
  if (!value.includes("/")) return value;

  const segments = value
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return value;

  const kept: string[] = [];
  for (const segment of segments) {
    const isRedundant = kept.some((existing) => existing === segment || existing.includes(segment));
    if (!isRedundant) kept.push(segment);
  }
  return kept.join("/");
}

export const UNTITLED_EVENT = "(ללא כותרת)";

/**
 * Cleans one calendar event title. Returns UNTITLED_EVENT rather than an
 * empty string when nothing survives, so callers never render a blank row —
 * matching the fallback the calendar routes already used for a missing
 * Google `summary`.
 */
export function sanitizeEventTitle(raw: string | undefined | null): string {
  if (!raw) return UNTITLED_EVENT;

  // NFC first: Hebrew text arrives with combining marks (nikud, dagesh)
  // decomposed from some sources, which breaks both the equality checks
  // below and any later string comparison. This is the "robust UTF-8
  // handling" half of the fix.
  let value = raw.normalize("NFC");

  value = value.replace(INVISIBLE, "").replace(CONTROL, " ");
  value = stripFusedLatin(value);
  value = dropRedundantSegments(value);
  value = collapseRepeatedWords(value);

  // Whitespace last, so earlier steps can leave gaps behind freely.
  value = value.replace(/\s+/g, " ").trim();
  // A separator left stranded by a dropped segment ("פגישה /" or "/ פגישה").
  value = value.replace(/\s*\/\s*$/, "").replace(/^\s*\/\s*/, "").trim();

  return value || UNTITLED_EVENT;
}
