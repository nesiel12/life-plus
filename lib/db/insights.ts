import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("insights");

export const insightsRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "created_at", ascending: false }),
};
