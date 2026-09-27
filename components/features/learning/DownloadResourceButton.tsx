"use client";

import type { MouseEvent } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n/useT";
import { downloadResourceForOffline } from "@/lib/learning/downloadResource";
import { lessonQueryKey, stepBriefQueryKey } from "@/lib/query/offlineKeys";
import { readStoredAgeGroup, readStoredTeachingMode } from "@/lib/learning/masterclassPrefs";
import { cn } from "@/lib/utils";

interface DownloadResourceButtonProps {
  topicId: string;
  stepId: string;
  className?: string;
}

/**
 * Explicit "save this for offline" control — distinct from the passive
 * hover-prefetch on "שיעור אמן" (lib/learning/lessonPrefetch.ts), which only
 * ever reads an existing server-side cache and never spends a model call. A
 * click here is a real request to make the resource available offline, so
 * unlike the hover it generates on a miss. Always visible, not hover-gated:
 * on a touch device there is no hover, and hiding the only way to save a
 * lesson offline behind one would make it undiscoverable on a phone.
 *
 * The same resource can render this button twice (the syllabus row and the
 * step-preview card) — `useQuery({ enabled: false })` reads the shared
 * QueryClient cache reactively, so downloading from one instance flips the
 * other to "downloaded" too, instead of each holding its own stale local
 * state until it happens to remount.
 */
export function DownloadResourceButton({ topicId, stepId, className }: DownloadResourceButtonProps) {
  const t = useT();
  const queryClient = useQueryClient();

  // enabled: false means these never fetch — they only ever mirror
  // whatever downloadResourceForOffline (or the ordinary hover-prefetch/
  // classroom open) has already put in the cache, for this exact key.
  const brief = useQuery({ queryKey: stepBriefQueryKey(stepId), queryFn: () => null, enabled: false });
  const lesson = useQuery({
    queryKey: lessonQueryKey(topicId, stepId, readStoredAgeGroup(), readStoredTeachingMode()),
    queryFn: () => null,
    enabled: false,
  });
  const downloaded = brief.data != null && lesson.data != null;

  const download = useMutation({
    mutationFn: () => downloadResourceForOffline(queryClient, topicId, stepId),
  });

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    // These buttons live inside rows that are themselves clickable (select
    // the step, open the lesson) — never trigger those too.
    e.preventDefault();
    e.stopPropagation();
    if (downloaded || download.isPending) return;
    download.reset();
    download.mutate();
  };

  const label = downloaded ? t("nav.downloaded") : download.isPending ? t("nav.downloading") : t("nav.downloadForOffline");

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={download.isPending || downloaded}
      aria-label={label}
      title={label}
      className={cn(
        "focus-ring grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full transition-colors",
        downloaded ? "text-accent-health" : download.isError ? "text-accent-family" : "text-muted hover:bg-fill-subtle hover:text-foreground",
        className
      )}
    >
      {download.isPending ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : downloaded ? (
        <Check size={16} aria-hidden />
      ) : (
        <Download size={16} aria-hidden />
      )}
    </button>
  );
}

