import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("knowledge_entries");

export const knowledgeEntriesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "entry_date", ascending: false }),
};
