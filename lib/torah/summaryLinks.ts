// Reverse-relation matching between a Summary and a Rabbi/Book.
//
// summaries has no rabbiId/bookIds column — AiSummaryModal's buildContent
// folds the AI-linked rabbi/book names into summaries.content as plain
// lines ("רב: X", "מקורות: Y, Z") because the schema was deliberately kept
// to the same {title, content} shape the manual composer already used (see
// the AI Summarizer milestone). This module is the one place that knows
// that text format, so the save side (AiSummaryModal) and every read side
// (RabbiProfileModal, and any future Book profile) share one parser
// instead of each re-deriving it.

// Normalized-equality match, not a fuzzy library — trimming case/whitespace/
// Hebrew geresh-gershayim punctuation already resolves the realistic
// mismatches (see AiSummaryModal's original comment on this same function).
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[׳״'"`]/g, "")
    .replace(/\s+/g, " ");
}

export function extractLinkedRabbiName(content: string): string | null {
  const match = content.match(/^רב: (.+)$/m);
  return match ? match[1].trim() : null;
}

export function extractLinkedBookNames(content: string): string[] {
  const match = content.match(/^מקורות: (.+)$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

// Best available stand-in for a dedicated `tldr` field: summaries.content
// has none. For an AI-created summary the first paragraph *is* the tldr
// verbatim (buildContent pushes it first); for a manually-composed one it's
// just the start of whatever the user wrote — still the most useful
// preview available without a schema change.
const PREVIEW_MAX_CHARS = 220;

export function summaryPreview(content: string): string {
  const firstParagraph = content.split("\n\n")[0]?.trim() ?? "";
  if (firstParagraph.length <= PREVIEW_MAX_CHARS) return firstParagraph;
  return `${firstParagraph.slice(0, PREVIEW_MAX_CHARS).trim()}…`;
}
