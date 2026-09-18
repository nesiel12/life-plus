import { NextResponse } from "next/server";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { havrutaMessagesRepo, havrutaThreadsRepo } from "@/lib/db/havruta";
import { havrutaOpeners } from "@/lib/torah/havruta";
import { loadHavrutaSubject } from "@/lib/torah/havrutaContext";
import { subjectHref, toMessageView, toThreadView } from "@/lib/torah/havrutaDto";

export const runtime = "nodejs";

/** GET — one thread with its messages and subject, for /areas/torah/havruta/[id]. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const thread = await havrutaThreadsRepo.get(user.id, id);
  if (!thread) return NextResponse.json({ error: "הדיון לא נמצא." }, { status: 404 });

  const [messages, subject] = await Promise.all([
    havrutaMessagesRepo.listForThread(user.id, id),
    loadHavrutaSubject(user.id, thread.subject_type, thread.subject_id),
  ]);

  return NextResponse.json({
    thread: toThreadView(thread),
    messages: messages.map(toMessageView),
    subject: subject
      ? { title: subject.title, byline: subject.byline ?? null, contradiction: subject.contradiction ?? null }
      : { title: thread.title ?? "נושא שנמחק", byline: null, contradiction: null },
    subjectHref: subjectHref(thread.subject_type, thread.subject_id),
    openers: havrutaOpeners(thread.mode, thread.subject_type),
  });
}

/** DELETE — removes a discussion and its messages. */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  await havrutaThreadsRepo.remove(auth.user.id, id);
  return NextResponse.json({ ok: true });
}
