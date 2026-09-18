import "server-only";
import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";

type UserRow = NonNullable<Awaited<ReturnType<typeof getUserByEmail>>>;

/**
 * The session's user row, or the response to return instead.
 *
 * The same three checks every user-scoped route opens with — session, rate
 * limit, user row — in the same order, so a route cannot forget the limiter
 * or resolve the user from anything but the session.
 */
export async function requireSessionUser(
  rateLimit?: { key: string; limit: number; windowMs: number }
): Promise<{ user: UserRow; response?: undefined } | { user?: undefined; response: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (rateLimit) {
    const limited = rateLimitResponse(`${rateLimit.key}:${session.user.email}`, rateLimit.limit, rateLimit.windowMs);
    if (limited) return { response: limited };
  }
  const user = await getUserByEmail(session.user.email);
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  return { user };
}
