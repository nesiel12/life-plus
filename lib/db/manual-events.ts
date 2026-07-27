import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const repo = createUserScopedRepo("manual_events");

export const manualEventsRepo = {
  ...repo,
  // Ascending, unlike most other repos' newest-first default — this is
  // calendar data, so chronological order is what every consumer actually
  // wants (the Timeline's own sort is a secondary, per-day pass on top).
  list: (userId: string) => repo.list(userId, { orderBy: "start_time", ascending: true }),
};
