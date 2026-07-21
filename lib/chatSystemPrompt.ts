import type { AtlasContext } from "@/lib/context/types";
import { buildIntelligenceSignals, rankSignals, detectPriorityConflicts, formatSignalsForPrompt } from "@/lib/intelligence/core";

const BASE_SYSTEM_PROMPT = `You are Atlas — a calm, personal life companion, not a generic assistant.
You know Nesiel (נסיאל): he learns Torah daily, tracks a morning Seder, and builds AI/software
projects. His family includes his parents Hedva (חדוה) and Oded (עודד), his siblings Elyasaf, Anael,
Adir Michael, Odaya, and Roniya, and a young cousin he cares about.

Speak calmly and briefly. Reflect his patterns back to him with warmth and insight rather than giving
generic productivity advice. Never sound like a customer-support chatbot.`;

const EMPTY_CONTEXT: AtlasContext = {
  personalDNA: null,
  activeGoals: [],
  lifeAreas: [],
  upcomingEvents: [],
  relevantMemory: [],
  relationshipSignals: [],
  personalPatterns: [],
  recommendationInsights: [],
};

const MAX_CHAT_SIGNALS = 12;

// Chat's system prompt is the richest consumer of the Atlas Intelligence
// Engine (docs/ATLAS_ARCHITECTURE_VISION.md §9) — everything Atlas knows
// about the user goes through buildIntelligenceSignals -> rankSignals
// -> formatSignalsForPrompt instead of a hand-ordered list of sections.
// This function no longer decides what matters most or in what order it
// appears; it only renders what the engine already decided. Kept out of
// route.ts (which imports server-only DB modules transitively via
// buildAtlasContext) so it stays unit-testable on its own — the Intelligence
// Engine is pure, so this whole chain still needs no server-only import.
export function buildSystemPrompt(context: AtlasContext = EMPTY_CONTEXT): string {
  const signals = buildIntelligenceSignals(context);
  const ranked = rankSignals(signals);
  const formatted = formatSignalsForPrompt(ranked, MAX_CHAT_SIGNALS);

  if (!formatted) return BASE_SYSTEM_PROMPT;

  const conflicts = detectPriorityConflicts(ranked);
  const conflictNote =
    conflicts.length > 0
      ? `\n\nCompeting priorities worth being aware of (don't force a resolution — just don't ignore that they're in tension):\n${conflicts
          .map((c) => `- ${c.note}`)
          .join("\n")}`
      : "";

  return (
    `${BASE_SYSTEM_PROMPT}\n\nWhat Atlas currently knows about him, ranked by importance ` +
    `(highest-priority first — a "(ביטחון נמוך)" tag means treat it as a weaker signal, not a fact):\n${formatted}${conflictNote}`
  );
}
