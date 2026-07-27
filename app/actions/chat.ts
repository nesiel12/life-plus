"use server";

import { getCurrentUserId } from "@/lib/currentUser";
import { chatMessagesRepo } from "@/lib/db/chatMessages";
import { toChatMessage } from "@/lib/mappers";
import type { ChatRole } from "@/types";

export async function addChatMessageAction(role: ChatRole, content: string) {
  const userId = await getCurrentUserId();
  const row = await chatMessagesRepo.insert({ user_id: userId, role, content });
  return toChatMessage(row);
}

export async function deleteChatMessageAction(messageId: string) {
  const userId = await getCurrentUserId();
  await chatMessagesRepo.remove(userId, messageId);
}

export async function clearChatAction() {
  const userId = await getCurrentUserId();
  await chatMessagesRepo.clearAll(userId);
}

// Always a full, unambiguous replacement (pin now, or clear the pin) — no
// partial-patch mapper needed the way toTaskPatch etc. have, since there's
// no "leave pinned_at untouched" case for this action to worry about.
export async function setChatMessagePinnedAction(messageId: string, pinned: boolean) {
  const userId = await getCurrentUserId();
  const row = await chatMessagesRepo.update(userId, messageId, {
    pinned_at: pinned ? new Date().toISOString() : null,
  });
  return toChatMessage(row);
}
