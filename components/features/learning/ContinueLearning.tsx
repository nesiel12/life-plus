"use client";

import { useMemo, useState } from "react";
import { ArrowUpRight, Loader2, PlayCircle, Search, Sparkles } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { youtubeSearchUrl, youtubeVideoId } from "@/lib/learning/youtube";
import { InlineVideoPlayer } from "@/components/features/learning/InlineVideoPlayer";
import type { LearningTopic } from "@/types";

// "המשך למידה" — what to learn next for the topic you're on.
//
// Three honest sources, no invented video ids: the topic's own unfinished
// resources (embedded when they're YouTube), an AI set of next search
// directions for the subject (on demand), and a plain search for the topic.
export function ContinueLearning({ topic }: { topic: LearningTopic }) {
  const resources = useAtlasStore((s) => s.learningResources);

  const [aiTerms, setAiTerms] = useState<string[] | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const nextUp = useMemo(
    () => resources.filter((r) => r.topicId === topic.id && !r.isCompleted).slice(0, 3),
    [resources, topic.id]
  );

  const searchQuery = [topic.title, topic.category].filter(Boolean).join(" ");

  async function suggestMore() {
    if (loadingAi) return;
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/learning-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: searchQuery }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(typeof data.error === "string" ? data.error : "לא הצלחנו להביא הצעות.");
        return;
      }
      const terms: unknown = data?.youtube_suggestions;
      if (Array.isArray(terms)) setAiTerms(terms.filter((t): t is string => typeof t === "string").slice(0, 5));
    } catch {
      setAiError("אין חיבור לשירות.");
    } finally {
      setLoadingAi(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline-card bg-surface p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <PlayCircle size={15} className="text-accent-learning" aria-hidden />
        המשך למידה
      </p>

      {nextUp.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {nextUp.map((resource) => {
            const vid = resource.url ? youtubeVideoId(resource.url) : null;
            return (
              <li key={resource.id} className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-foreground/90">{resource.title}</p>
                {vid ? (
                  <InlineVideoPlayer videoId={vid} title={resource.title} />
                ) : resource.url ? (
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring inline-flex items-center gap-1 text-xs text-gold-ink hover:opacity-80"
                  >
                    פתח את המשאב
                    <ArrowUpRight size={12} aria-hidden />
                  </a>
                ) : (
                  <span className="text-xs text-muted">{resource.notes ?? "משאב מתוכנן"}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">סיימת את כל המשאבים המתוכננים לנושא הזה.</p>
      )}

      {/* AI next directions — search terms, rendered as one-tap searches. */}
      {aiTerms && aiTerms.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-hairline-card pt-2.5">
          <p className="text-[0.7rem] font-medium text-muted">כיוונים נוספים ללמוד:</p>
          <div className="flex flex-wrap gap-1.5">
            {aiTerms.map((term) => (
              <a
                key={term}
                href={youtubeSearchUrl(term)}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-hairline-card px-2 py-1 text-[0.7rem] text-foreground/80 transition-colors hover:text-foreground"
              >
                <Search size={10} aria-hidden />
                {term}
              </a>
            ))}
          </div>
        </div>
      )}
      {aiError && <p className="text-xs text-accent-family">{aiError}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {!aiTerms && (
          <button
            onClick={suggestMore}
            disabled={loadingAi}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-accent-learning/15 px-3 py-1.5 text-xs font-medium text-accent-learning transition-opacity hover:opacity-80 disabled:opacity-40"
          >
            {loadingAi ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Sparkles size={12} aria-hidden />}
            {loadingAi ? "מחפש…" : "הצע כיוונים נוספים"}
          </button>
        )}
        <a
          href={youtubeSearchUrl(searchQuery)}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Search size={12} aria-hidden />
          חפש עוד סרטונים
        </a>
      </div>
    </div>
  );
}
