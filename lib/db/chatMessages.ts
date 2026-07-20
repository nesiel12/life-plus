import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("chat_messages");

export const chatMessagesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "created_at", ascending: true }),
};
