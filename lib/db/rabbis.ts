import "server-only";
import { createUserScopedRepo } from "@/lib/db/createUserScopedRepo";

export const rabbisRepo = createUserScopedRepo("rabbis");
