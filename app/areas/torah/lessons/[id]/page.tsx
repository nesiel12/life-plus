import { LessonPage } from "@/components/features/torah/lessons/LessonPage";

// A lesson's own page: player, interactive transcript, chapters, sources.
export default async function TorahLessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonPage lessonId={id} />;
}
