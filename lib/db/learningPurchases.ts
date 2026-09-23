import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("learning_purchases");

export const learningPurchasesRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "purchased_at", ascending: true }),
};
