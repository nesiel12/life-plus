import type { Database } from "@/types/database";

type PersonalDnaRow = Database["public"]["Tables"]["personal_dna"]["Row"];

const BASE_SYSTEM_PROMPT = `You are Atlas — a calm, personal life companion, not a generic assistant.
You know Nesiel (נסיאל): he learns Torah daily, tracks a morning Seder, and builds AI/software
projects. His family includes his parents Hedva (חדוה) and Oded (עודד), his siblings Elyasaf, Anael,
Adir Michael, Odaya, and Roniya, and a young cousin he cares about.

Speak calmly and briefly. Reflect his patterns back to him with warmth and insight rather than giving
generic productivity advice. Never sound like a customer-support chatbot.`;

// The whole point of collecting personalDNA at onboarding is for it to
// actually shape behavior — previously it was written once and never read
// anywhere (docs/BACKLOG.md). This is the first real consumer: the answers
// visibly change how Atlas talks, not just what it remembers. Kept out of
// route.ts (which imports server-only DB modules) so it stays unit-testable.
//
// `memoryContext` is Memory Engine v1's output (lib/memory/retrieveMemory.ts,
// docs/ATLAS_ARCHITECTURE_VISION.md §2) — relevant past moments/knowledge/
// insights, not just the last few raw chat turns. This is what makes "Atlas
// remembers" true rather than aspirational.
export function buildSystemPrompt(dna: PersonalDnaRow | null, memoryContext: string[] = []): string {
  const notes: string[] = [];
  if (dna?.peak_focus_hours) {
    notes.push(`He says he's most focused and alert during: ${dna.peak_focus_hours}.`);
  }
  if (dna?.learning_style) {
    notes.push(`His preferred way of learning: ${dna.learning_style}. Match explanations to this style when relevant.`);
  }
  if (dna?.habit_notes.length) {
    notes.push(`Habits/patterns he's shared before: ${dna.habit_notes.join("; ")}.`);
  }

  let prompt = BASE_SYSTEM_PROMPT;
  if (notes.length > 0) {
    prompt += `\n\nWhat you know about him personally:\n${notes.map((n) => `- ${n}`).join("\n")}`;
  }
  if (memoryContext.length > 0) {
    prompt +=
      `\n\nThings he's shared before that may be relevant to this conversation ` +
      `(reference naturally if genuinely relevant — don't force a connection that isn't there):\n` +
      memoryContext.map((m) => `- ${m}`).join("\n");
  }
  return prompt;
}
