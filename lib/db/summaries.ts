import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("summaries");

export const summariesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "summary_date", ascending: false }),
};
