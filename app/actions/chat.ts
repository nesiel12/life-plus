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
