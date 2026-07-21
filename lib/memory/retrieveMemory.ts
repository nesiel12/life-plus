import "server-only";
import { momentsRepo } from "@/lib/db/moments";
import { knowledgeEntriesRepo } from "@/lib/db/knowledgeEntries";
import { insightsRepo } from "@/lib/db/insights";
import { chatMessagesRepo } from "@/lib/db/chatMessages";
import { toMoment, toKnowledgeEntry, toInsight, toChatMessage } from "@/lib/mappers";
import { momentCategoryLabel } from "@/lib/lifeAreas";
import { rankByRelevance, type MemoryCandidate } from "@/lib/memory/rankRelevance";

const DEFAULT_LIMIT = 5;

// Memory Engine v1's only DB-facing piece: pulls the user's existing
// moments/knowledge_entries/insights/chat_messages (already durably
// stored — this is a recall gap, not a storage gap, see docs/ATLAS_
// ARCHITECTURE_VISION.md §2) and ranks them against the current query.
// Returns pre-formatted lines ready to drop into an LLM prompt, so callers
// don't need to know the underlying entity shapes.
//
// chat_messages joined the candidate pool for AI Companion Experience v2
// (§10) — real support for "reference previous conversations" and
// continuity across sessions. A short conversation sends its whole
// history to /api/chat anyway (app/api/chat/route.ts's zod schema caps it
// at 50 messages), so this mostly duplicates what the model can already
// see for a light user; its real value shows up once history grows past
// that cap and an older, relevant exchange needs to be recalled on
// purpose rather than assumed to still be in the visible window.
export async function retrieveRelevantMemory(
  userId: string,
  query: string,
  limit = DEFAULT_LIMIT
): Promise<string[]> {
  const [momentRows, knowledgeRows, insightRows, chatMessageRows] = await Promise.all([
    momentsRepo.list(userId),
    knowledgeEntriesRepo.list(userId),
    insightsRepo.list(userId),
    chatMessagesRepo.list(userId),
  ]);

  const candidates: MemoryCandidate[] = [
    ...momentRows.map(toMoment).map(
      (m): MemoryCandidate => ({
        id: `moment:${m.id}`,
        text: `${m.title} ${m.content}`,
        timestamp: m.timestamp,
        label: `רגע (${momentCategoryLabel(m.category)}, ${m.timestamp.slice(0, 10)}): ${m.title} — ${m.content}`,
      })
    ),
    ...knowledgeRows.map(toKnowledgeEntry).map(
      (k): MemoryCandidate => ({
        id: `knowledge:${k.id}`,
        text: `${k.topic} ${k.summary} ${k.source}`,
        timestamp: k.date,
        label: `שיעור (${k.date}): ${k.topic} — ${k.summary}`,
      })
    ),
    ...insightRows.map(toInsight).map(
      (i): MemoryCandidate => ({
        id: `insight:${i.id}`,
        text: i.content,
        timestamp: i.timestamp,
        label: `תובנה (${i.timestamp.slice(0, 10)}): ${i.content}`,
      })
    ),
    ...chatMessageRows.map(toChatMessage).map(
      (c): MemoryCandidate => ({
        id: `chat:${c.id}`,
        text: c.content,
        timestamp: c.timestamp,
        label: `שיחה קודמת (${c.role === "user" ? "את/ה" : "אטלס"}, ${c.timestamp.slice(0, 10)}): ${c.content}`,
      })
    ),
  ];

  return rankByRelevance(query, candidates, limit).map((ranked) => ranked.label);
}
