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
import { computeStreak, type RecoveryEvent, type RecoveryProgram } from "@/lib/recovery/streak";
import type { Database } from "@/types/database";

export const runtime = "nodejs";

const RATE_LIMIT = { limit: 60, windowMs: 5 * 60 * 1000 };

type ProgramRow = Database["public"]["Tables"]["recovery_programs"]["Row"];
type EventRow = Database["public"]["Tables"]["recovery_events"]["Row"];

function toProgram(row: ProgramRow): RecoveryProgram {
  return {
    id: row.id,
    title: row.title,
    cleanSince: row.clean_since,
    reasons: row.reasons ?? [],
    triggers: row.triggers ?? [],
    riskHours: row.risk_hours ?? [],
    copingStrategies: row.coping_strategies ?? [],
    celebratedMilestones: row.celebrated_milestones ?? [],
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function toEvent(row: EventRow): RecoveryEvent {
  return {
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurred_at,
    intensity: row.intensity ?? undefined,
    trigger: row.trigger ?? undefined,
    note: row.note ?? undefined,
  };
}

/**
 * Everything behind the lock.
 *
 * Returns 423 Locked — not 401 — when the unlock is missing or expired: the
 * user IS authenticated, they simply have not proven presence on the device.
 * The client uses that distinction to show the unlock prompt rather than
 * bouncing them to sign-in.
 *
 * Nothing about recovery is in the app's bootstrap payload, so this route is
 * the only way the data reaches a browser at all.
 */
async function requireUnlocked() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const limited = rateLimitResponse(
    `recovery:${session.user.email}`,
    RATE_LIMIT.limit,
    RATE_LIMIT.windowMs
  );
  if (limited) return { error: limited };

  const user = await getUserByEmail(session.user.email);
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!(await isUnlocked(user.id))) {
    return { error: NextResponse.json({ error: "locked" }, { status: 423 }) };
  }

  return { userId: user.id };
}

export async function GET() {
  const gate = await requireUnlocked();
  if (gate.error) return gate.error;

  try {
    const rows = await recoveryProgramsRepo.list(gate.userId);
    const now = new Date();

    const programs = await Promise.all(
      rows.map(async (row) => {
        const program = toProgram(row);
        const events = (await recoveryEventsRepo.listForProgram(gate.userId, row.id)).map(toEvent);
        return { program, events, streak: computeStreak(program, events, now) };
      })
    );

    return NextResponse.json({ programs });
  } catch (err) {
    console.error("[recovery] read failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לטעון את הנתונים." }, { status: 500 });
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(80),
  cleanSince: z.string().datetime({ offset: true }),
  reasons: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
  triggers: z.array(z.string().trim().min(1).max(80)).max(15).default([]),
  riskHours: z.array(z.number().int().min(0).max(23)).max(24).default([]),
  copingStrategies: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});

export async function POST(request: NextRequest) {
  const gate = await requireUnlocked();
  if (gate.error) return gate.error;

  const parsed = await parseJsonBody(request, createSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  // A clean date in the future would produce a streak that counts down.
  if (new Date(input.cleanSince).getTime() > Date.now()) {
    return NextResponse.json({ error: "תאריך ההתחלה לא יכול להיות בעתיד." }, { status: 400 });
  }

  try {
    const row = await recoveryProgramsRepo.create(gate.userId, {
      title: input.title,
      clean_since: input.cleanSince,
      reasons: input.reasons,
      triggers: input.triggers,
      risk_hours: input.riskHours,
      coping_strategies: input.copingStrategies,
    });
    const program = toProgram(row);
    return NextResponse.json({
      program,
      events: [],
      streak: computeStreak(program, [], new Date()),
    });
  } catch (err) {
    console.error("[recovery] create failed:", err);
    return NextResponse.json({ error: "לא הצלחנו ליצור את התוכנית." }, { status: 500 });
  }
}

const patchSchema = z.object({
  programId: z.string().uuid(),
  title: z.string().trim().min(1).max(80).optional(),
  cleanSince: z.string().datetime({ offset: true }).optional(),
  reasons: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  triggers: z.array(z.string().trim().min(1).max(80)).max(15).optional(),
  riskHours: z.array(z.number().int().min(0).max(23)).max(24).optional(),
  copingStrategies: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  celebratedMilestones: z.array(z.number().int().min(0).max(3650)).max(20).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  const gate = await requireUnlocked();
  if (gate.error) return gate.error;

  const parsed = await parseJsonBody(request, patchSchema);
  if (parsed.error) return parsed.error;
  const { programId, ...patch } = parsed.data;

  if (patch.cleanSince && new Date(patch.cleanSince).getTime() > Date.now()) {
    return NextResponse.json({ error: "תאריך ההתחלה לא יכול להיות בעתיד." }, { status: 400 });
  }

  try {
    const row = await recoveryProgramsRepo.update(gate.userId, programId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.cleanSince !== undefined ? { clean_since: patch.cleanSince } : {}),
      ...(patch.reasons !== undefined ? { reasons: patch.reasons } : {}),
      ...(patch.triggers !== undefined ? { triggers: patch.triggers } : {}),
      ...(patch.riskHours !== undefined ? { risk_hours: patch.riskHours } : {}),
      ...(patch.copingStrategies !== undefined ? { coping_strategies: patch.copingStrategies } : {}),
      ...(patch.celebratedMilestones !== undefined
        ? { celebrated_milestones: patch.celebratedMilestones }
        : {}),
      ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
    });

    const program = toProgram(row);
    const events = (await recoveryEventsRepo.listForProgram(gate.userId, programId)).map(toEvent);
    return NextResponse.json({ program, events, streak: computeStreak(program, events, new Date()) });
  } catch (err) {
    console.error("[recovery] update failed:", err);
    return NextResponse.json({ error: "לא הצלחנו לשמור את השינוי." }, { status: 500 });
  }
}

const deleteSchema = z.object({
  programId: z.string().uuid(),
  /** Archiving is the default; a purge is irreversible and must be explicit. */
  purge: z.boolean().default(false),
});

export async function DELETE(request: NextRequest) {
  const gate = await requireUnlocked();
  if (gate.error) return gate.error;

  const parsed = await parseJsonBody(request, deleteSchema);
  if (parsed.error) return parsed.error;

  try {
    if (parsed.data.purge) {
      await recoveryProgramsRepo.purge(gate.userId, parsed.data.programId);
    } else {
      await recoveryProgramsRepo.archive(gate.userId, parsed.data.programId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[recovery] delete failed:", err);
    return NextResponse.json({ error: "לא הצלחנו למחוק את התוכנית." }, { status: 500 });
  }
}
