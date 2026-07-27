import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("transactions");

export const transactionsRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "transaction_date", ascending: false }),
};
