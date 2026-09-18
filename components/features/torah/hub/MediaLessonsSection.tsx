"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookmarkCheck, BookmarkPlus, ExternalLink, Play, Radio, Search, Tv, MonitorPlay } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { AddStudyItem } from "@/components/features/torah/AddStudyItem";
import { PageSection, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { nextSortOrder } from "@/lib/torah/studyHub";
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeVideoId, youtubeWatchUrl } from "@/lib/learning/youtube";
import { youtubeSearchUrl } from "@/lib/torah/links";
import { cn } from "@/lib/utils";

/** Mirrors YoutubeVideo from lib/torah/sources/youtube.ts. */
interface Video {
  videoId: string;
  title: string;
  channelTitle?: string;
  publishedAt?: string;
}

interface MediaResponse {
  channel: Video[];
  search: Video[];
  queries: string[];
  searchConfigured: boolean;
  channelConfigured: boolean;
}

interface MediaLessonsSectionProps {
  entityType: "book" | "rabbi";
  entityId: string;
  name: string;
  /** The recorded channel, so editing it refetches the channel shelf. */
  channelUrl?: string;
  delay?: number;
}

/**
 * The YouTube section of a Book or Rabbi page.
 *
 * Three shelves, each labelled with where it came from, so a video the user
 * saved, the rav's own channel, and a search result are never confused:
 *   • "השיעורים ששמרתי" — study items filed on this page (the user's own);
 *   • "מהערוץ הרשמי" — the recorded channel's latest uploads;
 *   • "מיוטיוב" — search results, when a YouTube key is configured.
 * With no key, the search shelf becomes honest search links instead of
 * invented videos.
 *
 * One featured player at the top: clicking any tile plays it there, in
 * place, without leaving the page.
 */
export function MediaLessonsSection({ entityType, entityId, name, channelUrl, delay }: MediaLessonsSectionProps) {
  const summaries = useAtlasStore((s) => s.summaries);
  const addSummary = useAtlasStore((s) => s.addSummary);

  const [data, setData] = useState<MediaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<Video | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/torah/media?type=${entityType}&id=${entityId}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((json: MediaResponse | null) => {
        if (!controller.signal.aborted) setData(json);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [entityType, entityId, channelUrl]);

  const pinned = useMemo(
    () =>
      summaries
        .filter((s) => s.kind === "video" && s.entityType === entityType && s.entityId === entityId && s.url)
        .map((s) => ({ summaryId: s.id, videoId: youtubeVideoId(s.url!), title: s.title }))
        .filter((v): v is { summaryId: string; videoId: string; title: string } => Boolean(v.videoId)),
    [summaries, entityType, entityId]
  );
  const pinnedIds = useMemo(() => new Set(pinned.map((v) => v.videoId)), [pinned]);

  function play(video: Video) {
    setFeatured(video);
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }

  async function save(video: Video) {
    setSaving(video.videoId);
    try {
      await addSummary({
        title: video.title,
        content: "",
        kind: "video",
        url: youtubeWatchUrl(video.videoId),
        entityType,
        entityId,
        sortOrder: nextSortOrder(summaries, { entityType, entityId }),
      });
    } finally {
      setSaving(null);
    }
  }

  const channel = data?.channel ?? [];
  const search = data?.search ?? [];
  const nothingFound = !loading && pinned.length === 0 && channel.length === 0 && search.length === 0;

  return (
    <PageSection
      id="youtube"
      icon={MonitorPlay}
      tone="family"
      title="שיעורי וידאו ביוטיוב"
      subtitle={entityType === "rabbi" ? `שיעורים של ${name} ועל תורתו` : `שיעורים על ${name}`}
      delay={delay}
    >
      <div className="flex flex-col gap-5">
        {featured && (
          <div ref={playerRef} className="flex flex-col gap-2">
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-hairline-card bg-black">
              <iframe
                key={featured.videoId}
                // Mounted by the tile click, so autoplay has its user gesture.
                src={`${youtubeEmbedUrl(featured.videoId)}?autoplay=1&rel=0&modestbranding=1`}
                title={featured.title}
                className="size-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <p className="line-clamp-2 text-sm font-medium text-foreground">{featured.title}</p>
              {!pinnedIds.has(featured.videoId) && (
                <SaveButton saving={saving === featured.videoId} onClick={() => void save(featured)} />
              )}
            </div>
          </div>
        )}

        {pinned.length > 0 && (
          <Shelf icon={BookmarkCheck} label="השיעורים ששמרתי">
            {pinned.map((video) => (
              <VideoTile
                key={video.summaryId}
                video={{ videoId: video.videoId, title: video.title }}
                active={featured?.videoId === video.videoId}
                onPlay={play}
              />
            ))}
          </Shelf>
        )}

        {channel.length > 0 && (
          <Shelf icon={Radio} label="מהערוץ הרשמי">
            {channel.map((video) => (
              <VideoTile
                key={video.videoId}
                video={video}
                active={featured?.videoId === video.videoId}
                onPlay={play}
                saved={pinnedIds.has(video.videoId)}
                saving={saving === video.videoId}
                onSave={save}
              />
            ))}
          </Shelf>
        )}

        {search.length > 0 && (
          <Shelf icon={Tv} label="מיוטיוב">
            {search.map((video) => (
              <VideoTile
                key={video.videoId}
                video={video}
                active={featured?.videoId === video.videoId}
                onPlay={play}
                saved={pinnedIds.has(video.videoId)}
                saving={saving === video.videoId}
                onSave={save}
              />
            ))}
          </Shelf>
        )}

        {loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="aspect-video animate-pulse rounded-xl bg-fill" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-fill" />
              </div>
            ))}
          </div>
        )}

        {nothingFound && (
          <SectionPlaceholder
            icon={MonitorPlay}
            title="עדיין אין כאן שיעורים"
            body={
              entityType === "rabbi"
                ? "שמור שיעורים מיוטיוב, או הוסף את הערוץ הרשמי של הרב בפרטי הקשר — והשיעורים החדשים שלו יופיעו כאן."
                : "שמור שיעורים מיוטיוב על הספר, והם יחכו לך כאן ליד הסיכומים שלך."
            }
          />
        )}

        {/* Search links: the honest version of "find shiurim" when there is
            no API key to list real videos with. Shown with a key too, as a
            way to look further than the first page of results. */}
        {!loading && data && data.queries.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Search size={12} aria-hidden />
              {data.searchConfigured ? "לחיפוש נוסף ביוטיוב" : "חיפושים מוצעים ביוטיוב"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {data.queries.map((query) => (
                <a
                  key={query}
                  href={youtubeSearchUrl(query)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="focus-ring flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:border-gold-line hover:text-foreground"
                >
                  {query}
                  <ExternalLink size={11} className="text-muted" aria-hidden />
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-hairline-card pt-4">
          <AddStudyItem
            entityType={entityType}
            entityId={entityId}
            onWriteSummary={() => {}}
            kinds={["video"]}
            hideWriteSummary
          />
        </div>
      </div>
    </PageSection>
  );
}

function Shelf({ icon: Icon, label, children }: { icon: typeof Radio; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon size={12} aria-hidden />
        {label}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  );
}

interface VideoTileProps {
  video: Video;
  active: boolean;
  onPlay: (video: Video) => void;
  saved?: boolean;
  saving?: boolean;
  onSave?: (video: Video) => void;
}

function VideoTile({ video, active, onPlay, saved, saving, onSave }: VideoTileProps) {
  return (
    <article className="group flex flex-col gap-2">
      <button
        type="button"
        onClick={() => onPlay(video)}
        aria-label={`נגן: ${video.title}`}
        className={cn(
          "focus-ring relative block overflow-hidden rounded-xl border bg-surface-sunken",
          active ? "border-gold ring-2 ring-gold-soft" : "border-hairline-card"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={youtubeThumbnailUrl(video.videoId)}
          alt=""
          loading="lazy"
          className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="grid size-11 place-items-center rounded-full bg-white/90 text-black shadow-lg">
            <Play size={18} className="ms-0.5 fill-current" aria-hidden />
          </span>
        </span>
        {active && (
          <span className="absolute start-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[0.6rem] font-medium text-white">
            מתנגן
          </span>
        )}
      </button>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="line-clamp-2 text-xs font-medium leading-snug text-foreground" dir="auto">
            {video.title}
          </p>
          {video.channelTitle && <p className="mt-0.5 truncate text-[0.65rem] text-muted">{video.channelTitle}</p>}
        </div>
        {onSave &&
          (saved ? (
            <span className="shrink-0 text-gold-ink" title="נשמר" aria-label="נשמר">
              <BookmarkCheck size={14} aria-hidden />
            </span>
          ) : (
            <SaveButton compact saving={saving} onClick={() => onSave(video)} />
          ))}
      </div>
    </article>
  );
}

function SaveButton({ saving, onClick, compact }: { saving?: boolean; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      aria-label="שמור לשיעורים שלי"
      className={cn(
        "focus-ring flex shrink-0 items-center gap-1 rounded-full text-xs text-muted transition-colors hover:text-gold-ink disabled:opacity-50",
        compact ? "p-1" : "border border-hairline-card px-2.5 py-1"
      )}
    >
      <BookmarkPlus size={14} className={saving ? "animate-pulse" : undefined} aria-hidden />
      {!compact && "שמור"}
    </button>
  );
}
