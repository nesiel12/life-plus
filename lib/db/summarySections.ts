import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("summary_sections");

export const summarySectionsRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "sort_order", ascending: true }),
};
