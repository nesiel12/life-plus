"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Check, Link2, Clock, Target } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { useApiCall } from "@/hooks/useApiCall";
import { daysSince } from "@/lib/utils";
import type { KnowledgeEntry, Flashcard } from "@/types";
import type { EntryInsight } from "@/lib/learning/types";

interface StudyMaterial {
  flashcards: Flashcard[];
  reviewQuestions: string[];
}

interface KnowledgeLibraryCardProps {
  entry: KnowledgeEntry;
  insight?: EntryInsight;
  delay: number;
  onMarkReviewed: () => void;
}

// One item in the "personal knowledge library" (Learning Experience v2,
// docs/ATLAS_ARCHITECTURE_VISION.md §10) — the existing topic/source/
// summary card, now able to expand into study material (flashcards/review
// questions, generated lazily and cached server-side — see
// app/api/torah/study-material) and showing what Atlas already knows is
// related, without a second data-fetching mechanism.
export function KnowledgeLibraryCard({ entry, insight, delay, onMarkReviewed }: KnowledgeLibraryCardProps) {
  const [studying, setStudying] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [studyMaterial, setStudyMaterial] = useState<StudyMaterial | null>(
    entry.flashcards && entry.reviewQuestions ? { flashcards: entry.flashcards, reviewQuestions: entry.reviewQuestions } : null
  );

  const { loading, error, run: fetchStudyMaterial } = useApiCall(async () => {
    const res = await fetch("/api/torah/study-material", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entryId: entry.id }),
    });
    if (!res.ok) throw new Error("לא הצלחנו להכין חומר לתרגול. נסה שוב.");
    const data = (await res.json()) as StudyMaterial & { error?: string };
    if (data.error) throw new Error(data.error);
    setStudyMaterial({ flashcards: data.flashcards, reviewQuestions: data.reviewQuestions });
  });

  function handleToggleStudy() {
    const next = !studying;
    setStudying(next);
    if (next && !studyMaterial) {
      fetchStudyMaterial().catch(() => {
        // error already captured for display below
      });
    }
  }

  function toggleReveal(i: number) {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <GlassCard delay={delay} className="p-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-medium text-foreground">{entry.topic}</span>
        <span className="ltr text-xs text-muted">{entry.date}</span>
      </div>
      <p className="mb-2 text-sm leading-relaxed text-foreground/70">{entry.summary}</p>
      <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
        <span>{entry.source}</span>
        {entry.durationMinutes ? <span>· {entry.durationMinutes} דק&apos;</span> : null}
        {entry.lastReviewedAt && (
          <span>· נלמד {daysSince(entry.lastReviewedAt) === 0 ? "היום" : `לפני ${daysSince(entry.lastReviewedAt)} ימים`}</span>
        )}
      </div>

      {insight && insight.connectedGoals.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {insight.connectedGoals.map((title) => (
            <span
              key={title}
              className="flex items-center gap-1 rounded-full bg-accent-faith/15 px-2 py-0.5 text-xs text-accent-faith"
            >
              <Target size={10} aria-hidden />
              {title}
            </span>
          ))}
        </div>
      )}

      {insight && (insight.relatedKnowledge.length > 0 || insight.relatedMemory.length > 0) && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg bg-fill-subtle p-3 text-xs">
          {insight.relatedKnowledge.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-muted">
                <Link2 size={12} aria-hidden />
                שיעורים קשורים
              </p>
              {insight.relatedKnowledge.map((topic) => (
                <p key={topic} className="text-foreground/70">
                  {topic}
                </p>
              ))}
            </div>
          )}
          {insight.relatedMemory.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-muted">
                <Clock size={12} aria-hidden />
                קשור להיסטוריה שלך
              </p>
              {insight.relatedMemory.map((line, i) => (
                <p key={i} className="text-foreground/70">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={handleToggleStudy}
          className="focus-ring flex items-center gap-1 rounded-lg bg-accent-knowledge/15 px-3 py-1.5 text-xs font-medium text-accent-knowledge transition-opacity hover:opacity-80"
        >
          <Brain size={12} aria-hidden />
          {studying ? "סגור תרגול" : "תרגל"}
        </button>
        <button
          onClick={onMarkReviewed}
          className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground"
        >
          <Check size={12} aria-hidden />
          סימון כנלמד
        </button>
      </div>

      {studying && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mt-3 rounded-lg bg-fill-subtle p-3"
        >
          {loading && (
            <div className="flex flex-col gap-2" aria-hidden>
              <div className="h-10 w-full animate-pulse rounded-lg bg-fill-subtle" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-fill-subtle" />
            </div>
          )}

          {error && <p className="text-xs text-accent-family">{error}</p>}

          {!loading && !error && studyMaterial && (
            <>
              {studyMaterial.flashcards.length === 0 && studyMaterial.reviewQuestions.length === 0 ? (
                <p className="text-xs text-muted">אין עדיין חומר תרגול לשיעור הזה.</p>
              ) : (
                <>
                  {studyMaterial.flashcards.length > 0 && (
                    <>
                      <p className="mb-2 text-xs text-muted">כרטיסיות</p>
                      <div className="mb-3 flex flex-col gap-2">
                        {studyMaterial.flashcards.map((card, i) => (
                          <button
                            key={i}
                            onClick={() => toggleReveal(i)}
                            className="focus-ring rounded-lg bg-fill-subtle p-3 text-start text-xs transition-colors hover:bg-fill"
                          >
                            <p className="text-foreground">{card.front}</p>
                            {revealed.has(i) && <p className="mt-1 text-foreground/70">{card.back}</p>}
                            {!revealed.has(i) && <p className="mt-1 text-muted">הצג תשובה</p>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {studyMaterial.reviewQuestions.length > 0 && (
                    <>
                      <p className="mb-2 text-xs text-muted">שאלות לחזרה</p>
                      <ul className="flex list-disc flex-col gap-1 ps-4 text-xs text-foreground/70">
                        {studyMaterial.reviewQuestions.map((question, i) => (
                          <li key={i}>{question}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </motion.div>
      )}
    </GlassCard>
  );
}
