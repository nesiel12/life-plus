"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { GlassCard } from "@/components/ui/GlassCard";
import { TopicCard } from "@/components/features/learning/TopicCard";
import { VideoStudyPanel } from "@/components/features/learning/VideoStudyPanel";
import { LearningSplitView } from "@/components/features/learning/LearningSplitView";
import { ContinueLearning } from "@/components/features/learning/ContinueLearning";
import { BackToHome } from "@/components/layout/BackToHome";

// Learning & Knowledge Space (Phase 7): replaces the previous generic
// AreaMomentsView placeholder (which just logged free-text "knowledge"
// moments) with a real, first-class feature — learning topics with their
// own AI-populated resource checklist, same "quick-add row + GlassCard
// list" convention every other space (Torah Library, Time & Tasks) already
// established.
export default function LearningSpacePage() {
  const learningTopics = useAtlasStore((s) => s.learningTopics);
  const learningResources = useAtlasStore((s) => s.learningResources);
  const addLearningTopic = useAtlasStore((s) => s.addLearningTopic);
  const updateLearningResource = useAtlasStore((s) => s.updateLearningResource);

  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  // The topic currently open in the 50/50 study view. Separate from
  // `expandedTopicId` (the inline resource checklist) because they are two
  // different modes: skim the track, or sit down and study it.
  const [studyingTopicId, setStudyingTopicId] = useState<string | null>(null);

  const { loading: adding, error: addError, run: createTopic } = useApiCall(addLearningTopic);

  const studyingTopic = learningTopics.find((t) => t.id === studyingTopicId) ?? null;

  function handleAdd() {
    const title = newTitle.trim();
    if (!title || adding) return;
    createTopic({ title, category: newCategory.trim() || undefined })
      .then(() => {
        setNewTitle("");
        setNewCategory("");
      })
      .catch(() => {
        // error is already captured in addError for display below
      });
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <h1 className="mb-1 text-2xl font-medium tracking-tight">למידה</h1>
      <p className="mb-8 text-sm text-muted">
        מרחב הלמידה האישי שלך — נושאים, מקורות והדרכה מבוססת AI, כל נושא עם מסלול משלו.
      </p>

      <GlassCard className="mb-8">
        <p className="mb-4 text-sm font-medium text-muted">צפה ולמד בתוך Life Plus</p>
        <VideoStudyPanel />
      </GlassCard>

      <GlassCard delay={0} className="mb-6">
        <p className="mb-3 text-sm font-medium text-muted">נושא לימוד חדש</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="נושא, למשל: תכנות ב-Python, ניתוח עלילה"
            aria-label="שם נושא הלימוד"
            className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="קטגוריה (לא חובה)"
            aria-label="קטגוריית נושא הלימוד"
            className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted sm:w-48"
          />
          <button
            onClick={handleAdd}
            disabled={!newTitle.trim() || adding}
            className="focus-ring flex items-center justify-center gap-1 rounded-lg bg-accent-learning/20 px-3 py-2 text-sm text-accent-learning transition-opacity disabled:opacity-40"
          >
            <Plus size={14} aria-hidden />
            {adding ? "מוסיף…" : "הוסף נושא"}
          </button>
        </div>
        {addError && <p className="mt-2 text-xs text-accent-family">{addError}</p>}
      </GlassCard>

      {studyingTopic && (
        <GlassCard className="mb-8">
          <LearningSplitView
            topicTitle={studyingTopic.title}
            videoUrl={
              learningResources.find((r) => r.topicId === studyingTopic.id && r.type === "youtube" && r.url)?.url
            }
            onQuizComplete={() => {
              // Auto-mark the topic's studied video complete on finishing the
              // quiz, rather than making the user tick it separately. The
              // store update is optimistic, so the checklist reflects it
              // immediately.
              const resource = learningResources.find(
                (r) => r.topicId === studyingTopic.id && r.type === "youtube" && !r.isCompleted
              );
              if (resource) {
                updateLearningResource(resource.id, { isCompleted: true }).catch(() => {});
              }
            }}
            onClose={() => setStudyingTopicId(null)}
          />
          <div className="mt-5">
            <ContinueLearning topic={studyingTopic} />
          </div>
        </GlassCard>
      )}

      <div className="flex flex-col gap-4">
        {learningTopics.map((topic, i) => (
          <TopicCard
            key={topic.id}
            topic={topic}
            resources={learningResources.filter((r) => r.topicId === topic.id)}
            expanded={expandedTopicId === topic.id}
            onToggleExpanded={() => setExpandedTopicId((prev) => (prev === topic.id ? null : topic.id))}
            onStudy={() => setStudyingTopicId(topic.id)}
            delay={Math.min(i * 0.06, 0.3)}
          />
        ))}
        {learningTopics.length === 0 && (
          <p className="text-sm text-muted">עדיין אין נושאי לימוד. הוסף את הנושא הראשון למעלה כדי להתחיל.</p>
        )}
      </div>
    </main>
  );
}
