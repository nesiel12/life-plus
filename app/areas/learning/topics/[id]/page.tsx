import { redirect } from "next/navigation";

// A stable, shareable link to one topic — what the Shabbat-sheet-style QR
// code on the printable study sheet points at (lib/learning/topicQr.ts). The
// lab itself has no separate URL per topic (it is one client page with a
// canvas that opens over it), so this exists purely to translate a topic id
// in the URL into "open the lab with this topic's canvas up"
// (LearningHub reads ?open=<id> on mount) — same redirect-to-canonical-route
// pattern as app/areas/time/page.tsx.
export default async function LearningTopicRedirect({ params }: { params: Promise<{ id: string }> }): Promise<never> {
  const { id } = await params;
  redirect(`/areas/learning?open=${encodeURIComponent(id)}`);
}
