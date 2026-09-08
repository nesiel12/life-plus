"use client";

import { useMemo } from "react";
import { ArrowUpRight, PlayCircle, Search } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { youtubeSearchUrl, youtubeVideoId } from "@/lib/learning/youtube";
import { InlineVideoPlayer } from "@/components/features/learning/InlineVideoPlayer";
import type { LearningTopic } from "@/types";

// "המשך למידה" — what to watch next for the topic you're on.
//
// Two honest sources, no invented video ids: the topic's own resources you
// haven't finished yet (embedded when they're YouTube), and a YouTube search
// for the topic + its category, which is where to look for more.
export function ContinueLearning({ topic }: { topic: LearningTopic }) {
  const resources = useAtlasStore((s) => s.learningResources);

  const nextUp = useMemo(
    () =>
      resources
        .filter((r) => r.topicId === topic.id && !r.isCompleted)
        .slice(0, 3),
    [resources, topic.id]
  );

  const searchQuery = [topic.title, topic.category].filter(Boolean).join(" ");

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

      <a
        href={youtubeSearchUrl(searchQuery)}
        target="_blank"
        rel="noopener noreferrer"
        className="focus-ring inline-flex items-center gap-1.5 self-start rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <Search size={12} aria-hidden />
        חפש עוד סרטונים על {topic.title}
      </a>
    </div>
  );
}
