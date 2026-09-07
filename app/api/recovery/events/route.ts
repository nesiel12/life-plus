import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db/users";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { recoveryEventsRepo, recoveryProgramsRepo } from "@/lib/db/recovery";
import { isUnlocked } from "@/lib/recovery/lock";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 60, windowMs: 5 * 60 * 1000 };

const createSchema = z.object({
  programId: z.string().uuid(),
  kind: z.enum(["relapse", "urge", "note"]),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  intensity: z.number().int().min(1).max(5).optional(),
  trigger: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * Logging what happened: a relapse, a craving survived, or a note.
 *
 * `urge` is the most valuable of the three and the one the UI makes easiest to
 * record — it is the event that reveals which hours and triggers are actually
 * dangerous, and it is a small win worth marking rather than a failure worth
 * hiding.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(
    `recovery-events:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return limited;

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUnlocked(user.id))) {
    return NextResponse.json({ error: "locked" }, { status: 423 });
  }

  const parsed = await parseJsonBody(request, createSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  // Ownership is checked explicitly rather than relying on the insert's own
  // user_id: without this, a crafted programId would file an event against
  // someone else's program.
  const program = await recoveryProgramsRepo.get(user.id, input.programId);
  if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const row = await recoveryEventsRepo.create(user.id, {
      program_id: input.programId,
      kind: input.kind,
      occurred_at: input.occurredAt,
      intensity: input.intensity ?? null,
      trigger: input.trigger || null,
      note: input.note || null,
    });

    return NextResponse.json({
      event: {
        id: row.id,
        kind: row.kind,
        occurredAt: row.occurred_at,
        intensity: row.intensity ?? undefined,
        trigger: row.trigger ?? undefined,
        note: row.note ?? undefined,
      },
    });
  } catch (err) {
    console.error("[recovery/events] create failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לשמור." }, { status: 500 });
  }
}

const deleteSchema = z.object({ eventId: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUserByEmail(session.user.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isUnlocked(user.id))) {
    return NextResponse.json({ error: "locked" }, { status: 423 });
  }

  const parsed = await parseJsonBody(request, deleteSchema);
  if (parsed.error) return parsed.error;

  try {
    // A relapse logged by mistake resets a streak that was real, so undoing
    // one has to be possible.
    await recoveryEventsRepo.remove(user.id, parsed.data.eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[recovery/events] delete failed:", err);
    return NextResponse.json({ error: "לא הצלחנו למחוק." }, { status: 500 });
  }
}
