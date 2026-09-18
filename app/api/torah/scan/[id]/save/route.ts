import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionUser } from "@/lib/api/sessionUser";
import { parseJsonBody } from "@/lib/api/parseJsonBody";
import { handwritingScansRepo } from "@/lib/db/handwritingScans";
import { kgEdgesRepo } from "@/lib/db/kgEdges";
import { summariesRepo } from "@/lib/db/summaries";
import { summarySectionsRepo } from "@/lib/db/summarySections";
import { resolveAudioEntity } from "@/lib/torah/attachments/entities";
import { cleanScanMarkdown, scanMarkdownToHtml, suggestScanTitle } from "@/lib/torah/handwriting";
import type { Json } from "@/types/database";

export const runtime = "nodejs";

const saveSchema = z.object({
  markdown: z.string().trim().min(2).max(60_000),
  title: z.string().trim().min(1).max(200).optional(),
  // "note" files it in the personal notes hub, with no entity binding.
  entityType: z.enum(["book", "rabbi", "lesson", "note"]),
  entityId: z.string().min(1).max(200).optional(),
  sectionId: z.string().uuid().optional(),
});

/**
 * Files a reviewed scan as a real note.
 *
 * The text saved is what the LEARNER approved, not what the model returned —
 * the row keeps both (`markdown` is the model's, `edited_markdown` theirs), so
 * "how good is the OCR really?" stays answerable after a month of edits.
 *
 * Binding:
 *   book / rabbi → summaries.entity_type + entity_id, the same filing every
 *     other note on those pages uses, so it appears in their notes section.
 *   lesson → the summaries table's entity vocabulary does not include lessons
 *     (20260905000000 constrains it to book/rabbi/person/topic), so the link is
 *     written as a `summary --about--> lesson` edge in kg_edges — the table
 *     that exists precisely to carry relationships the typed columns cannot.
 *   note → no binding; it lives in the personal notes hub.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionUser({ key: "torah-scan-save", limit: 40, windowMs: 10 * 60 * 1000 });
  if (auth.response) return auth.response;
  const { user } = auth;
  const { id } = await context.params;

  const parsed = await parseJsonBody(request, saveSchema);
  if (parsed.error) return parsed.error;
  const input = parsed.data;

  const scan = await handwritingScansRepo.get(user.id, id);
  if (!scan) return NextResponse.json({ error: "הסריקה לא נמצאה." }, { status: 404 });
  if (scan.status === "saved" && scan.summary_id) {
    return NextResponse.json({ error: "הסריקה כבר נשמרה." }, { status: 409 });
  }

  let entityHref: string | null = "/areas/torah/notes";
  if (input.entityType !== "note") {
    if (!input.entityId) return NextResponse.json({ error: "לא נבחר פריט לשיוך." }, { status: 400 });
    const entity = await resolveAudioEntity(user.id, input.entityType, input.entityId);
    if (!entity) return NextResponse.json({ error: "הפריט לא נמצא." }, { status: 404 });
    entityHref = entity.href;
  }
  if (input.sectionId) {
    const sections = await summarySectionsRepo.list(user.id);
    if (!sections.some((section) => section.id === input.sectionId)) {
      return NextResponse.json({ error: "המדור לא נמצא." }, { status: 404 });
    }
  }

  const markdown = cleanScanMarkdown(input.markdown);
  const title = input.title?.trim() || suggestScanTitle(markdown);
  const filed = input.entityType === "book" || input.entityType === "rabbi";

  const summary = await summariesRepo.insert({
    user_id: user.id,
    title,
    content: markdown,
    content_html: scanMarkdownToHtml(markdown),
    kind: "summary",
    entity_type: filed ? input.entityType : null,
    entity_id: filed ? (input.entityId as string) : null,
    section_id: input.sectionId ?? null,
    is_draft: false,
    summary_date: new Date().toISOString().slice(0, 10),
  });

  if (input.entityType === "lesson" && input.entityId) {
    await kgEdgesRepo
      .upsertMany([
        {
          user_id: user.id,
          from_type: "summary",
          from_id: summary.id,
          relation: "about",
          to_type: "lesson",
          to_id: input.entityId,
          origin: "user",
          weight: 1,
          evidence: { scanId: scan.id } as Json,
        },
      ])
      .catch((err) => console.error("[scan] edge write failed:", err));
  }

  await handwritingScansRepo.update(user.id, id, {
    status: "saved",
    summary_id: summary.id,
    entity_type: input.entityType,
    entity_id: input.entityType === "note" ? null : input.entityId ?? null,
    title,
    // Only when it differs — an untouched reading should not look edited.
    edited_markdown: markdown === scan.markdown ? null : markdown,
  });

  return NextResponse.json({ summaryId: summary.id, href: entityHref ?? "/areas/torah/notes", title });
}
