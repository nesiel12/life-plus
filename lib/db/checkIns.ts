import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("check_ins");

export const checkInsRepo = {
  ...repo,
  /** Newest first — the widget needs the most recent one to decide whether
   *  to prompt, and the profile is built from the same page of rows. */
  list: (userId: string) => repo.list(userId, { orderBy: "occurred_at", ascending: false }),
};
