import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("moments");

export const momentsRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "occurred_at", ascending: false }),
};
