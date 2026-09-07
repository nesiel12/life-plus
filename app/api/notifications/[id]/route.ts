import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { notificationsRepo } from "@/lib/db/notifications";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { toNotification } from "@/lib/mappers";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 120, windowMs: 5 * 60 * 1000 };

const patchSchema = z.object({
  action: z.enum(["read", "dismiss", "act"]),
});

const STATUS_FOR: Record<"read" | "dismiss" | "act", "read" | "dismissed" | "acted"> = {
  read: "read",
  dismiss: "dismissed",
  act: "acted",
};

/**
 * Marks one notification read, dismissed, or acted on.
 *
 * "acted" records that the user took up the suggestion — it does NOT perform
 * it. The affordance's own surface does that, with its own confirmation. This
 * endpoint returning the row's `action` payload is what lets the client route
 * there; nothing here is irreversible.
 *
 * Ownership is enforced inside the repo by the `user_id` filter, so a crafted
 * id belonging to someone else simply matches zero rows.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `notifications-patch:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody(request, patchSchema);
  if (parsed.error) return parsed.error;

  const { id } = await params;

  try {
    const row = await notificationsRepo.markStatus(user.id, id, STATUS_FOR[parsed.data.action]);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ notification: toNotification(row) });
  } catch (err) {
    console.error("[notifications] update failed:", err);
    return NextResponse.json({ error: "Could not update the notification." }, { status: 500 });
  }
}
