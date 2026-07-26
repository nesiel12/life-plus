import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

const mealsRepoBase = createUserScopedRepo("meals");

export const mealsRepo = {
  ...mealsRepoBase,
  list: (userId: string) => mealsRepoBase.list(userId, { orderBy: "eaten_at", ascending: false }),
};

const workoutsRepoBase = createUserScopedRepo("workouts");

export const workoutsRepo = {
  ...workoutsRepoBase,
  list: (userId: string) => workoutsRepoBase.list(userId, { orderBy: "start_time", ascending: false }),
};
