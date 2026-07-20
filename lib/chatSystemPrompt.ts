import type { AtlasContext } from "@/lib/context/types";
import { formatContextSection, joinContextSections } from "@/lib/context/formatContext";

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
};

// Chat's system prompt is the first (and richest) consumer of the Context
// Engine (docs/ATLAS_ARCHITECTURE_VISION.md §5) — everything Atlas knows
// about the user that's relevant right now gets folded in here, not just
// personalDNA. Kept out of route.ts (which imports server-only DB modules
// transitively via buildAtlasContext) so it stays unit-testable on its own.
export function buildSystemPrompt(context: AtlasContext = EMPTY_CONTEXT): string {
  const { personalDNA, activeGoals, lifeAreas, upcomingEvents, relevantMemory, relationshipSignals } = context;

  const dnaNotes: string[] = [];
  if (personalDNA?.peak_focus_hours) {
    dnaNotes.push(`He says he's most focused and alert during: ${personalDNA.peak_focus_hours}.`);
  }
  if (personalDNA?.learning_style) {
    dnaNotes.push(`His preferred way of learning: ${personalDNA.learning_style}. Match explanations to this style when relevant.`);
  }
  if (personalDNA?.habit_notes.length) {
    dnaNotes.push(`Habits/patterns he's shared before: ${personalDNA.habit_notes.join("; ")}.`);
  }

  const lifeAreaLines = lifeAreas.map((area) => `${area.label}: ${area.score}%`);

  const extra = joinContextSections([
    formatContextSection("What you know about him personally", dnaNotes),
    formatContextSection("His current life-area balance", lifeAreaLines),
    formatContextSection("His active goals right now", activeGoals),
    formatContextSection("Upcoming events on his calendar", upcomingEvents),
    formatContextSection("Relationship signals worth being aware of", relationshipSignals),
    formatContextSection(
      "Things he's shared before that may be relevant to this conversation " +
        "(reference naturally if genuinely relevant — don't force a connection that isn't there)",
      relevantMemory
    ),
  ]);

  return extra ? `${BASE_SYSTEM_PROMPT}\n\n${extra}` : BASE_SYSTEM_PROMPT;
}
