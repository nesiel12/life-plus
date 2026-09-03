import { z } from "zod";

// MemoriesAgent: writes the Hebrew caption on a Memory Card.
//
// Grounding note that shapes the whole design: this agent never sees the photo.
// It writes from the *surrounding context* Atlas already holds for that date —
// people, moments, calendar events — because that is the half of the feature
// that was never blocked by Google's API restrictions, and because captioning
// an image the model can't see would mean inventing what's in it.

export const memoryCaptionSchema = z.object({
  caption: z
    .string()
    .max(180)
    .describe("משפט אחד או שניים בעברית טבעית, חמים אך לא מתקתקים, על התקופה הזו"),
  mood: z
    .enum(["warm", "reflective", "celebratory", "neutral"])
    .describe("הטון של הרגע, לפי ההקשר שנמסר"),
});

export type MemoryCaption = z.infer<typeof memoryCaptionSchema>;

export const MEMORIES_AGENT_SYSTEM = [
  "אתה כותב כיתובים לכרטיסי זיכרון ב-Life Plus.",
  "",
  "כללים קשיחים:",
  "- אתה לא רואה את התמונה. אל תתאר מה נמצא בה ואל תנחש. כתוב על התקופה ועל ההקשר בלבד.",
  "- כתוב בעברית טבעית, בגוף שני, חם אבל מאופק. בלי קלישאות ובלי סופרלטיבים.",
  "- אם ההקשר ריק, כתוב משהו פשוט על הזמן שעבר. אל תמציא אירועים, אנשים או רגשות.",
  "- משפט אחד או שניים. לא יותר.",
  "- אל תשתמש באימוג'י.",
].join("\n");

export interface MemoryContext {
  yearsAgo: number;
  /** Formatted Hebrew date of the photo. */
  dateLabel: string;
  /** People whose records touch that date. */
  people?: string[];
  /** Titles of moments logged around then. */
  moments?: string[];
  /** Calendar events on that date. */
  events?: string[];
}

export function buildMemoryPrompt(context: MemoryContext): string {
  const lines = [`התמונה צולמה ${context.dateLabel}, לפני ${context.yearsAgo} שנים.`];

  if (context.people?.length) {
    lines.push(`אנשים שקשורים לתקופה: ${context.people.join(", ")}.`);
  }
  if (context.moments?.length) {
    lines.push(`רגעים שתועדו סביב התאריך: ${context.moments.join("; ")}.`);
  }
  if (context.events?.length) {
    lines.push(`אירועים ביומן באותו יום: ${context.events.join("; ")}.`);
  }
  if (!context.people?.length && !context.moments?.length && !context.events?.length) {
    lines.push("אין הקשר נוסף שמור על התאריך הזה.");
  }

  return lines.join("\n");
}
