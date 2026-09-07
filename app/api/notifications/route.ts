import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { notificationsRepo } from "@/lib/db/notifications";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { toNotification } from "@/lib/mappers";

// The notification centre's read endpoint.
//
// A route rather than a Server Action because the bell polls: the client
// re-reads this on an interval and on tab refocus, which is the useInsights /
// /api/briefing shape, not the store-mutation shape.

export const runtime = "nodejs";

// Generous: the client polls at most once a minute per tab, and a person with
// several tabs open should not rate-limit themselves out of their own bell.
const RATE_LIMIT = { limit: 120, windowMs: 5 * 60 * 1000 };

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `notifications:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const before = request.nextUrl.searchParams.get("before") ?? undefined;

  try {
    const [page, unreadCount] = await Promise.all([
      notificationsRepo.listPage(user.id, {
        limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20,
        before,
      }),
      notificationsRepo.countUnread(user.id),
    ]);

    return NextResponse.json({
      notifications: page.rows.map(toNotification),
      nextCursor: page.nextCursor,
      unreadCount,
    });
  } catch (err) {
    console.error("[notifications] read failed:", err);
    return NextResponse.json({ error: "Could not load notifications." }, { status: 500 });
  }
}
