"use client";

import { ChevronDown, ChevronUp, ExternalLink, NotebookPen, Trash2, Video } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SummaryContent } from "@/components/features/summaries/SummaryContent";
import { InlineVideoPlayer } from "@/components/features/learning/InlineVideoPlayer";
import { youtubeVideoId } from "@/lib/learning/youtube";
import { isFirst, isLast } from "@/lib/summaries/ordering";
import type { Summary } from "@/types";

interface StudyItemListProps {
  items: Summary[];
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onMove?: (id: string, delta: number) => void;
  emptyLabel?: string;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Renders a mixed list of study items — written summaries, video lessons and
// source references — in one ordered stream.
//
// Mixed rather than three separate lists on purpose: a chapter's material is
// a note *and* the shiur *and* the source text, and splitting them by type
// would scatter one topic across three places, which is the fragmentation
// this overhaul is meant to remove. Each item renders according to its kind.
export function StudyItemList({ items, onDelete, onEdit, onMove, emptyLabel }: StudyItemListProps) {
  const orderable = items.map((i) => ({ id: i.id, sortOrder: i.sortOrder ?? 0 }));

  if (items.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel ?? "אין כאן עדיין תוכן."}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, i) => {
        const kind = item.kind ?? "summary";
        const videoId = kind === "video" && item.url ? youtubeVideoId(item.url) : null;

        return (
          <GlassCard key={item.id} delay={Math.min(i * 0.04, 0.3)} className="p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 font-medium text-foreground">
                {kind === "video" ? (
                  <Video size={14} className="shrink-0 text-accent-family" aria-hidden />
                ) : kind === "source" ? (
                  <ExternalLink size={14} className="shrink-0 text-accent-knowledge" aria-hidden />
                ) : (
                  <NotebookPen size={14} className="shrink-0 text-accent-faith" aria-hidden />
                )}
                <span className="truncate">{item.title}</span>
                {item.isDraft && (
                  <span className="glass-control shrink-0 rounded-full px-2 py-0.5 text-[0.65rem] text-gold-ink">
                    טיוטה
                  </span>
                )}
              </span>

              <span className="flex shrink-0 items-center gap-1">
                {onMove && (
                  <>
                    <button
                      onClick={() => onMove(item.id, -1)}
                      disabled={isFirst(orderable, item.id)}
                      aria-label={`הזז את ${item.title} למעלה`}
                      className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp size={12} aria-hidden />
                    </button>
                    <button
                      onClick={() => onMove(item.id, 1)}
                      disabled={isLast(orderable, item.id)}
                      aria-label={`הזז את ${item.title} למטה`}
                      className="focus-ring grid size-6 place-items-center rounded text-muted transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown size={12} aria-hidden />
                    </button>
                  </>
                )}
                {onEdit && kind === "summary" && (
                  <button
                    onClick={() => onEdit(item.id)}
                    aria-label={`ערוך את ${item.title}`}
                    className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-gold-ink"
                  >
                    <NotebookPen size={12} aria-hidden />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => onDelete(item.id)}
                    aria-label={`מחק את ${item.title}`}
                    className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                )}
              </span>
            </div>

            {videoId && (
              <div className="mb-3">
                <InlineVideoPlayer videoId={videoId} title={item.title} />
              </div>
            )}

            {kind === "source" && item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring mb-2 flex w-fit items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-fill-subtle"
              >
                <ExternalLink size={11} className="text-accent-knowledge" aria-hidden />
                <span className="ltr">{hostOf(item.url)}</span>
              </a>
            )}

            {/* A video with no written note shows just the player — an empty
                "no content" line under every embed would be noise. */}
            {(item.contentHtml || item.content?.trim()) && (
              <SummaryContent
                html={item.contentHtml}
                text={item.content}
                className="text-sm text-foreground/80"
              />
            )}

            {!!item.tags?.length && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-muted">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
