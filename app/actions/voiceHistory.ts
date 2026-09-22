"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { voiceMessagesRepo, voiceSessionsRepo } from "@/lib/db/voiceHistory";

// The עוזר קולי's own conversation history — kept feature-local (this file,
// not lib/mappers.ts/types/index.ts, and not the Zustand store) the same way
// the Learning Lab's books/quotes/quiz attempts are: nothing outside the
// Voice Assistant reads this data, so it doesn't need to be everyone's
// concern. See lib/db/voiceHistory.ts's header for why the schema itself
// mirrors havruta_threads/havruta_messages.

export interface VoiceSession {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

function toVoiceSession(row: { id: string; title: string | null; created_at: string; updated_at: string }): VoiceSession {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}

function toVoiceMessage(row: { id: string; session_id: string; role: "user" | "assistant"; content: string; created_at: string }): VoiceMessage {
  return { id: row.id, sessionId: row.session_id, role: row.role, content: row.content, createdAt: row.created_at };
}

/** A title short enough for a history list row, cut at a word boundary rather than mid-word. */
function titleFrom(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 60) return trimmed;
  const cut = trimmed.slice(0, 60);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}…`;
}

export async function createVoiceSessionAction(): Promise<VoiceSession> {
  const userId = await getCurrentUserId();
  const row = await voiceSessionsRepo.insert({ user_id: userId });
  return toVoiceSession(row);
}

/**
 * Appends one turn and keeps the session's own bookkeeping current: the
 * first user turn becomes the session's title (setTitleIfEmpty — an
 * assistant turn never sets it, so a session always reads by what the
 * person said, not what they were told), and either role bumps
 * updated_at so the history list sorts by last activity.
 */
export async function appendVoiceMessageAction(sessionId: string, role: "user" | "assistant", content: string): Promise<VoiceMessage> {
  const userId = await getCurrentUserId();
  const [row] = await Promise.all([
    voiceMessagesRepo.insert({ user_id: userId, session_id: sessionId, role, content }),
    role === "user" ? voiceSessionsRepo.setTitleIfEmpty(userId, sessionId, titleFrom(content)) : Promise.resolve(),
    voiceSessionsRepo.touch(userId, sessionId),
  ]);
  return toVoiceMessage(row);
}

export async function listVoiceSessionsAction(): Promise<VoiceSession[]> {
  const userId = await getCurrentUserId();
  const rows = await voiceSessionsRepo.listRecent(userId);
  return rows.map(toVoiceSession);
}

export async function listVoiceMessagesAction(sessionId: string): Promise<VoiceMessage[]> {
  const userId = await getCurrentUserId();
  const rows = await voiceMessagesRepo.listForSession(userId, sessionId);
  return rows.map(toVoiceMessage);
}

export async function deleteVoiceSessionAction(sessionId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await voiceSessionsRepo.remove(userId, sessionId);
}
