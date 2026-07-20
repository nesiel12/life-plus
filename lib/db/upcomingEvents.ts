import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("upcoming_events");

export const upcomingEventsRepo = {
  ...repo,
  list: (userId: string) => repo.list(userId, { orderBy: "event_date", ascending: true }),
};
