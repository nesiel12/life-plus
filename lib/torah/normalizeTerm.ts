// Folding a Hebrew term to its matching form, for the global glossary.
//
// concepts.normalized_term is the uniqueness key: it is what makes
// "השגחה פרטית" written in three places converge on one concept page rather
// than three. The folding rules therefore have to be stable and boring —
// anything clever here silently merges terms that are not the same word.
//
// Written by the caller rather than as a generated column so these rules can
// change without a migration that rewrites the table (see the migration's
// note on normalized_term).

// Nikud, teamim and the other combining marks. Speech-to-text never emits
// them, typed text sometimes does, and they must never split a term in two.
const HEBREW_DIACRITICS = /[֑-ׇ]/g;

// Geresh/gershayim, in both their Unicode and ASCII-lookalike forms. "רמב״ם",
// "רמב''ם" and "רמבם" are one abbreviation written three ways.
const HEBREW_PUNCTUATION = /[׳״'"`׳״]/g;

// Maqaf (the Hebrew hyphen) and its ASCII stand-in join words rather than
// separate them: "בין-אדם" and "בין אדם" are the same phrase.
const JOINERS = /[־\-–—]/g;

/**
 * The matching form of a term.
 *
 * Deliberately does NOT strip the definite article ה or the prefix letters
 * ב/ל/כ/מ/ו. "הלכה" and "לכה" are different words, and a rule that removes a
 * leading ל to match them would be a bug that only shows up as two unrelated
 * concepts quietly merging.
 */
export function normalizeTerm(term: string): string {
  return term
    .normalize("NFKD")
    .replace(HEBREW_DIACRITICS, "")
    .replace(HEBREW_PUNCTUATION, "")
    .replace(JOINERS, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sameTerm(a: string, b: string): boolean {
  return normalizeTerm(a) === normalizeTerm(b);
}

/**
 * Whether a term is worth a glossary page at all.
 *
 * The glossary's value is that it collects recurring *concepts*. Without a
 * floor it fills with function words and single letters, and the one signal
 * it offers — "this idea keeps coming up" — is buried.
 */
export function isGlossaryWorthy(term: string): boolean {
  const normalized = normalizeTerm(term);
  if (normalized.length < 3) return false;
  if (STOP_TERMS.has(normalized)) return false;
  // A bare number is a reference, not a concept.
  if (/^\d+$/.test(normalized)) return false;
  return true;
}

// Hebrew function words that survive the length floor but carry no meaning
// as a glossary entry.
const STOP_TERMS = new Set([
  "של",
  "את",
  "עם",
  "על",
  "אל",
  "כל",
  "גם",
  "אבל",
  "אשר",
  "הוא",
  "היא",
  "הם",
  "זה",
  "זאת",
  "כמו",
  "רק",
  "עוד",
  "יותר",
  "פחות",
  "מאוד",
  "כך",
  "אז",
  "לכן",
  "כדי",
  "אחרי",
  "לפני",
]);

/**
 * Picks the form to display when the same concept was written several ways.
 *
 * The longest surface form wins: "השגחה פרטית" is more useful as a page title
 * than "השג״פ", and length is the honest proxy for "spelled out in full".
 */
export function preferredSurfaceForm(forms: string[]): string {
  if (forms.length === 0) return "";
  return [...forms].sort((a, b) => b.trim().length - a.trim().length || a.localeCompare(b, "he"))[0].trim();
}
