import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { notificationsRepo } from "@/lib/db/notifications";
import { rateLimitResponse } from "@/lib/api/rateLimit";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 30, windowMs: 5 * 60 * 1000 };

/** Clears the badge in one action, without dismissing anything. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `notifications-read-all:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const updated = await notificationsRepo.markAllRead(user.id);
    return NextResponse.json({ updated });
  } catch (err) {
    console.error("[notifications] read-all failed:", err);
    return NextResponse.json({ error: "Could not mark notifications as read." }, { status: 500 });
  }
}
