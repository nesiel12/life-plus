"use client";

import { useMemo } from "react";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { HeroVideoDialog } from "@/components/magicui/hero-video-dialog";
import { pickNextCourse } from "@/lib/learning/pickNextCourse";
import { youtubeThumbnailUrl, youtubeEmbedUrl } from "@/lib/learning/youtube";

// "The next Video Course to watch" (Sprint 6, the Unified Dashboard) —
// pickNextCourse (lib/learning/pickNextCourse.ts) makes a real, deterministic
// pick from the store's own learning data; this just renders it, watchable
// right on the dashboard via HeroVideoDialog (Sprint 2's own in-app player —
// this is what makes it a *unified* dashboard rather than another link out).
// Always occupies its dedicated cell (same reasoning as FinanceAlertCard's
// own header comment) — a quiet line replaces the player when there's
// genuinely nothing resumable, rather than an empty frame.
export function NextCourseCard() {
  const learningTopics = useAtlasStore((s) => s.learningTopics);
  const learningResources = useAtlasStore((s) => s.learningResources);

  const next = useMemo(
    () => pickNextCourse(learningTopics, learningResources),
    [learningTopics, learningResources]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <GraduationCap size={16} className="text-accent-learning" aria-hidden />
          הקורס הבא שלך
        </p>
        <Link href="/areas/learning" className="focus-ring rounded text-xs text-gold-ink transition-colors hover:opacity-80">
          למרחב הלמידה
        </Link>
      </div>

      {next ? (
        <>
          <HeroVideoDialog
            videoSrc={youtubeEmbedUrl(next.videoId)}
            thumbnailSrc={youtubeThumbnailUrl(next.videoId)}
            thumbnailAlt={next.resource.title}
          />
          <p className="mt-3 truncate text-sm text-foreground/90">{next.resource.title}</p>
          <p className="truncate text-xs text-muted">{next.topic.title}</p>
        </>
      ) : (
        <p className="text-xs text-muted">אין כרגע סרטון ממתין לצפייה.</p>
      )}
    </div>
  );
}
