import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { waterLogsRepo } from "@/lib/db/waterLogs";

export const runtime = "nodejs";

function toView(row: { id: string; amount_ml: number; logged_at: string }) {
  return { id: row.id, amountMl: row.amount_ml, loggedAt: row.logged_at };
}

/**
 * Today's water. `since` is the caller's own local midnight, sent from the
 * browser: "today" is the person's calendar day, not the server's.
 */
export async function GET(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;

  const raw = new URL(request.url).searchParams.get("since");
  const since = raw ? new Date(raw) : new Date(Date.now() - 24 * 3_600_000);
  if (Number.isNaN(since.getTime()) || Date.now() - since.getTime() > 48 * 3_600_000) {
    return NextResponse.json({ error: "טווח לא תקין." }, { status: 400 });
  }
  const rows = await waterLogsRepo.listSince(auth.user.id, since);
  return NextResponse.json({ logs: rows.map(toView) });
}

const addSchema = z.object({ amountMl: z.number().int().min(50).max(2000) });

export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "health-water", limit: 60, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const parsed = await parseJsonBody(request, addSchema);
  if (parsed.error) return parsed.error;
  const row = await waterLogsRepo.insert({ user_id: auth.user.id, amount_ml: parsed.data.amountMl });
  return NextResponse.json({ log: toView(row) }, { status: 201 });
}

/** Undo — removes one log by id (the widget's "ביטול"). */
export async function DELETE(request: Request) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "מזהה לא תקין." }, { status: 400 });
  await waterLogsRepo.remove(auth.user.id, id);
  return NextResponse.json({ ok: true });
}
