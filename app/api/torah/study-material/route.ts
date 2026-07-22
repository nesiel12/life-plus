import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { toKnowledgeEntry } from "@/lib/mappers";
import { generateStructuredData, isProviderConfigured } from "@/lib/ai";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 10, windowMs: 5 * 60 * 1000 }; // 10 generations / 5 min

const requestSchema = z.object({
  entryId: z.string().min(1),
});

const studyMaterialSchema = z.object({
  flashcards: z
    .array(z.object({ front: z.string(), back: z.string() }))
    .describe("3-6 flashcards, front is a question/prompt in Hebrew, back is the answer"),
  reviewQuestions: z
    .array(z.string())
    .describe("3-5 open-ended review questions in Hebrew that test real understanding, not recall of exact wording"),
});

// Learning Experience v2 (docs/ATLAS_ARCHITECTURE_VISION.md §10): the same
// generateObject + gpt-4o-mini pipeline app/api/torah/extract already
// established, applied to a different schema — deliberately not a new AI
// provider or capability, just a second structured-generation call over
// content Atlas already extracted and summarized. Generates from the
// entry's own summary/topic/source (already-extracted text), not by
// re-processing the original upload. Lazy and cached: a cache hit (both
// columns already populated) costs nothing and calls no AI at all.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`torah-study:${session.user.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;
  const { entryId } = parsed.data;

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entries = await knowledgeEntriesRepo.list(user.id);
  const entryRow = entries.find((e) => e.id === entryId);
  if (!entryRow) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  if (entryRow.flashcards && entryRow.review_questions) {
    return NextResponse.json({ flashcards: entryRow.flashcards, reviewQuestions: entryRow.review_questions });
  }

  if (!isProviderConfigured()) {
    return NextResponse.json(
      { flashcards: [], reviewQuestions: [], error: "אין מפתח AI מחובר, אז לא ניתן לייצר כרטיסיות ושאלות חזרה." },
      { status: 200 }
    );
  }

  try {
    const object = await generateStructuredData({
      schema: studyMaterialSchema,
      system:
        "You create study material (flashcards and review questions) from a Torah shiur's topic, source, and summary. Respond only based on the content given, no invented facts, everything in Hebrew.",
      prompt: `נושא: ${entryRow.topic}\nמקור: ${entryRow.source}\nסיכום: ${entryRow.summary}`,
    });

    const updated = await knowledgeEntriesRepo.saveStudyMaterial(
      user.id,
      entryId,
      object.flashcards,
      object.reviewQuestions
    );
    const entry = toKnowledgeEntry(updated);
    return NextResponse.json({ flashcards: entry.flashcards, reviewQuestions: entry.reviewQuestions });
  } catch {
    return NextResponse.json(
      { flashcards: [], reviewQuestions: [], error: "יצירת חומר הלמידה נכשלה. נסה שוב." },
      { status: 200 }
    );
  }
}
