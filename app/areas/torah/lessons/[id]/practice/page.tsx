import { Suspense } from "react";
import { LessonPractice } from "@/components/features/torah/lessons/LessonPractice";

// "לתרגל" for one lesson — part by part, with a ?part= deep link.
export default async function TorahLessonPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <LessonPractice lessonId={id} />
    </Suspense>
  );
}
