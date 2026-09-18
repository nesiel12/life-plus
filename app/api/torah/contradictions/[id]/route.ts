import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { contradictionAlertsRepo, havrutaThreadsRepo } from "@/lib/db/havruta";
import { havrutaThreadTitle } from "@/lib/torah/havruta";

export const runtime = "nodejs";

const patchSchema = z.object({
  status: z.enum(["open", "dismissed", "resolved"]).optional(),
  resolution: z.string().trim().max(1000).optional(),
});

/**
 * PATCH — the learner's decision: resolved ("יישבתי") or dismissed ("אין כאן
 * סתירה"). A decided pair is never raised again — the scan inserts with
 * ignoreDuplicates, so this row's status survives every future scan.
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  const parsed = await parseJsonBody(request, patchSchema);
  if (parsed.error) return parsed.error;

  const existing = await contradictionAlertsRepo.get(auth.user.id, id);
  if (!existing) return NextResponse.json({ error: "ההתראה לא נמצאה." }, { status: 404 });

  const updated = await contradictionAlertsRepo.update(auth.user.id, id, {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.resolution !== undefined ? { resolution: parsed.data.resolution || null } : {}),
  });
  return NextResponse.json({ id: updated.id, status: updated.status });
}

/**
 * POST — opens (or reopens) the Havruta on this contradiction and links it to
 * the alert, so the widget can say "יש דיון פתוח".
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const alert = await contradictionAlertsRepo.get(user.id, id);
  if (!alert) return NextResponse.json({ error: "ההתראה לא נמצאה." }, { status: 404 });

  let threadId = alert.thread_id;
  if (threadId && !(await havrutaThreadsRepo.get(user.id, threadId))) threadId = null;
  if (!threadId) {
    const thread =
      (await havrutaThreadsRepo.findForSubject(user.id, "contradiction", id, "contradiction")) ??
      (await havrutaThreadsRepo.insert({
        user_id: user.id,
        subject_type: "contradiction",
        subject_id: id,
        mode: "contradiction",
        title: havrutaThreadTitle("contradiction", "סתירה בין הסיכומים"),
      }));
    threadId = thread.id;
    await contradictionAlertsRepo.update(user.id, id, { thread_id: threadId });
  }
  return NextResponse.json({ threadId, href: `/areas/torah/havruta/${threadId}` });
}
