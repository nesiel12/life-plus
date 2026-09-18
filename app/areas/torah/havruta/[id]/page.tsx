import { HavrutaPage } from "@/components/features/torah/havruta/HavrutaPage";

// One Havruta discussion — a real URL, so the widget, the knowledge map and a
// contradiction alert can all link straight into a conversation.
export default async function TorahHavrutaThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HavrutaPage threadId={id} />;
}
