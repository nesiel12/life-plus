// Shared "- bullet list" prompt-section formatting — previously each AI
// route that wanted to fold a list of facts into a system prompt would
// have hand-rolled this (lib/chatSystemPrompt.ts already had one before
// the Context Engine existed). One place, used by every consumer of
// AtlasContext (docs/ATLAS_ARCHITECTURE_VISION.md §5).
export function formatContextSection(title: string, items: string[]): string {
  if (items.length === 0) return "";
  return `${title}:\n${items.map((item) => `- ${item}`).join("\n")}`;
}

export function joinContextSections(sections: string[]): string {
  return sections.filter(Boolean).join("\n\n");
}
