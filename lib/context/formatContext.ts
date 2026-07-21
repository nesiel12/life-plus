// Joins prompt-text fragments (a base instruction, a ranked-signals block,
// etc.), dropping empty ones — the one remaining shared formatting helper.
// Its sibling, formatContextSection (per-category titled bullet lists),
// was removed once the Atlas Intelligence Engine's formatSignalsForPrompt
// (lib/intelligence/core/format.ts) replaced every call site that used it
// (docs/ATLAS_ARCHITECTURE_VISION.md §9) — keeping an unused formatting
// primitive around "for later" is exactly what that milestone existed to
// stop doing.
export function joinContextSections(sections: string[]): string {
  return sections.filter(Boolean).join("\n\n");
}
