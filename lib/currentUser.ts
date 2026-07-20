import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import type { Database } from "@/types/database";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

// Every Server Action goes through one of these rather than trusting a
// client-passed user id — the DB row is always resolved fresh from the
// session's email.
export async function getCurrentUser(): Promise<UserRow> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new Error("Not authenticated");
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) {
    // Should not happen — lib/auth.ts's signIn event creates the row — but
    // fail loudly rather than silently act on a nonexistent user.
    throw new Error("User record not found for authenticated session");
  }

  return user;
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
