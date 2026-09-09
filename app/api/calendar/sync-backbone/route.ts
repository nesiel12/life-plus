import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { rateLimitResponse } from "@/lib/api/rateLimit";
import { invalidatePrefix } from "@/lib/api/ttlCache";
import { getUserByEmail } from "@/lib/db/users";
import { routineBlocksRepo } from "@/lib/db/routineBlocks";
import { personalDnaRepo } from "@/lib/db/personalDna";
import { toRoutineBlock } from "@/lib/mappers";
import { resolveUserTimezone } from "@/lib/proactive/timezone";
import { planBackboneSync } from "@/lib/calendar/backboneSync";

// Push the weekly skeleton into the user's real Google Calendar. One
// recurring event per block for the recurring scopes; one concrete
// occurrence per block for "single". The in-app skeleton stays the source of
// truth — this is for people who don't want to manage two calendars.

export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT = { limit: 6, windowMs: 10 * 60 * 1000 }; // it creates real events — keep it low

const requestSchema = z.object({
  scope: z.enum(["1d", "2d", "1m", "1y", "single"]),
});

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (!token?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limited = rateLimitResponse(`sync-backbone:${token.email}`, RATE_LIMIT.limit, RATE_LIMIT.windowMs);
  if (limited) return limited;

  const accessToken = token.error ? undefined : token.accessToken;
  if (!accessToken) {
    return NextResponse.json({ error: "היומן של Google לא מחובר." }, { status: 409 });
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (parsed.error) return parsed.error;

  const user = await getUserByEmail(token.email);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [blockRows, dna] = await Promise.all([
    routineBlocksRepo.list(user.id),
    personalDnaRepo.get(user.id).catch(() => null),
  ]);
  const blocks = blockRows.map(toRoutineBlock);
  if (blocks.length === 0) {
    return NextResponse.json({ error: "אין בלוקים בשלד השבועי לסנכרן." }, { status: 400 });
  }

  const timeZone = resolveUserTimezone(dna?.timezone);
  const { events, skipped } = planBackboneSync({
    blocks,
    today: new Date(),
    timeZone,
    scope: parsed.data.scope,
  });

  if (events.length === 0) {
    return NextResponse.json({ created: 0, skipped, error: "אין בלוקים שמתאימים לטווח שנבחר." }, { status: 400 });
  }

  let created = 0;
  const failures: string[] = [];

  for (const body of events) {
    try {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) created++;
      else failures.push(body.summary);
    } catch {
      failures.push(body.summary);
    }
  }

  for (const scope of ["range", "week", "upcoming", "month", "year"]) {
    invalidatePrefix(`calendar-${scope}:${token.email}`);
  }

  return NextResponse.json({ created, failures, skipped });
}
