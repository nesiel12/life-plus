import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getOrCreateUserByEmail, getUserByEmail } from "@/lib/db/users";
import { lifeAreaScoresRepo } from "@/lib/db/lifeAreaScores";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { notificationPreferencesRepo } from "@/lib/db/notificationPreferences";
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
  if (user) return user;

  // 2026-09-25: this used to throw here ("should not happen — lib/auth.ts's
  // signIn event creates the row"). It does happen, live — a session cookie
  // outlives the row it points at (the row was deleted directly, e.g.
  // during cleanup of a test account, or a genuine Supabase hiccup during
  // the very read above returned nothing for a row that does exist) — and
  // throwing turned that into an unhandled crash on the very first Server
  // Action any page happened to call, for every feature at once, instead of
  // a contained, recoverable moment.
  //
  // Self-heals instead: (re)provisions the row exactly the way lib/auth.ts's
  // own signIn event does — the identical getOrCreateUserByEmail call plus
  // the same three dependent per-user rows (life area scores, personal DNA,
  // notification preferences) — so a self-healed account isn't left in a
  // thinner state than a normally-provisioned one, which would just move
  // today's crash to whatever reads one of those three next. What that
  // event does NOT redo here: the Google Calendar credentials upsert, which
  // needs a fresh OAuth `account` object this read path never has — a
  // self-healed session is simply "connect Google Calendar again" until the
  // next real sign-in, the same tolerant state a never-connected account is
  // already in everywhere else in this app.
  //
  // Logged, not silent: an authenticated session with no matching row is
  // still worth knowing about even though it's now handled, in case it
  // signals something worse (rows disappearing) than the two benign causes
  // above.
  console.warn(`[currentUser] no users row for authenticated session ${session.user.email} — provisioning one now.`);
  const created = await getOrCreateUserByEmail(session.user.email, {
    name: session.user.name ?? session.user.email,
    image: session.user.image,
  });
  await Promise.all([
    lifeAreaScoresRepo.ensureDefaultsForUser(created.id),
    personalDnaRepo.upsert(created.id, {}),
    notificationPreferencesRepo.upsert(created.id, {}),
  ]);
  return created;
}

export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).id;
}
