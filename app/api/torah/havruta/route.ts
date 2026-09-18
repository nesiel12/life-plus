import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { havrutaMessagesRepo, havrutaThreadsRepo } from "@/lib/db/havruta";
import { havrutaOpeners, havrutaThreadTitle } from "@/lib/torah/havruta";
import { loadHavrutaSubject } from "@/lib/torah/havrutaContext";
import { subjectHref, toMessageView, toThreadView } from "@/lib/torah/havrutaDto";

export const runtime = "nodejs";

const SUBJECT_TYPES = ["summary", "lesson", "book", "rabbi", "concept", "contradiction"] as const;
const MODES = ["debate", "clarify", "contradiction"] as const;

const openSchema = z.object({
  subjectType: z.enum(SUBJECT_TYPES),
  subjectId: z.string().min(1).max(200),
  mode: z.enum(MODES).optional(),
  /** Start over instead of reopening the last conversation. */
  fresh: z.boolean().optional(),
});

/**
 * GET — the learner's recent discussions, for the "עיון וחברותא" widget.
 */
export async function GET() {
  const auth = await requireSessionUser();
  if (auth.response) return auth.response;

  const threads = await havrutaThreadsRepo.listRecent(auth.user.id, 6);
  return NextResponse.json({
    threads: threads.map((row) => ({ ...toThreadView(row), href: `/areas/torah/havruta/${row.id}`, subjectHref: subjectHref(row.subject_type, row.subject_id) })),
  });
}

/**
 * POST — opens a Havruta on a subject: the existing open thread in that mode,
 * or a new one. A contradiction is always discussed in contradiction mode.
 */
export async function POST(request: Request) {
  const auth = await requireSessionUser({ key: "torah-havruta-open", limit: 30, windowMs: 5 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;

  const parsed = await parseJsonBody(request, openSchema);
  if (parsed.error) return parsed.error;
  const { subjectType, subjectId } = parsed.data;
  const mode = subjectType === "contradiction" ? "contradiction" : parsed.data.mode === "contradiction" ? "debate" : (parsed.data.mode ?? "debate");

  const subject = await loadHavrutaSubject(user.id, subjectType, subjectId);
  if (!subject) return NextResponse.json({ error: "הנושא לא נמצא." }, { status: 404 });

  let thread = parsed.data.fresh ? null : await havrutaThreadsRepo.findForSubject(user.id, subjectType, subjectId, mode);
  if (parsed.data.fresh) {
    const previous = await havrutaThreadsRepo.findForSubject(user.id, subjectType, subjectId, mode);
    if (previous) await havrutaThreadsRepo.update(user.id, previous.id, { closed_at: new Date().toISOString() });
  }
  if (!thread) {
    thread = await havrutaThreadsRepo.insert({
      user_id: user.id,
      subject_type: subjectType,
      subject_id: subjectId,
      mode,
      title: havrutaThreadTitle(mode, subject.title),
    });
  }

  const messages = await havrutaMessagesRepo.listForThread(user.id, thread.id);
  return NextResponse.json({
    thread: toThreadView(thread),
    messages: messages.map(toMessageView),
    subject: { title: subject.title, byline: subject.byline ?? null, contradiction: subject.contradiction ?? null },
    openers: havrutaOpeners(mode, subjectType),
  });
}
