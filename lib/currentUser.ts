import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";

// Every Server Action goes through this rather than trusting a client-passed
// user id — the DB id is always resolved fresh from the session's email.
export async function getCurrentUserId(): Promise<string> {
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

  return user.id;
}
