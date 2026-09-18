import { RabbiPage } from "@/components/features/torah/rabbi/RabbiPage";

// A rabbi's profile page — the other half of the investigation loop.
export default async function TorahRabbiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RabbiPage rabbiId={id} />;
}
