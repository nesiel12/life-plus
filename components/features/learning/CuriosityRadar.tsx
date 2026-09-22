"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Play, Plus, Search, Shuffle, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { GlowBorder } from "@/components/features/learning/lab/GlowBorder";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { MagneticButton } from "@/components/features/learning/lab/MagneticButton";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { formatClock, parseVideoInput } from "@/lib/learning/youtubeInput";
import { fetchVideoMeta, type VideoMeta } from "@/lib/learning/youtubeOembed";
import { cn } from "@/lib/utils";

interface CuriosityRadarProps {
  query: string;
  onQueryChange: (query: string) => void;
  /** Topics the current query matches. */
  matches: readonly { id: string }[];
  onSurprise: () => void;
  rolling: boolean;
  canSurprise: boolean;
}

const UNTITLED_VIDEO = "סרטון YouTube";

/**
 * The lab's front door: one box that searches your topics as you type, adds a
 * new one, and turns a pasted YouTube link into a topic with its first video.
 *
 * The border lights up and circles while there is something in the box. A
 * pasted link pops its thumbnail in on a spring; the title is fetched on the
 * side and is optional — the thumbnail alone is enough to act on.
 *
 * Enter is deliberately not "always create": with matches on screen it opens
 * the first one, and it only creates when nothing matches, so searching can
 * never spawn a stray topic. The button always creates.
 */
export function CuriosityRadar({ query, onQueryChange, matches, onSurprise, rolling, canSurprise }: CuriosityRadarProps) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const addLearningTopic = useAtlasStore((s) => s.addLearningTopic);
  const addLearningResource = useAtlasStore((s) => s.addLearningResource);

  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const text = query.trim();
  const video = useMemo(() => parseVideoInput(query), [query]);
  const videoId = video?.videoId ?? null;

  // The title is polish: fetched once per pasted video, abandoned if the link changes.
  useEffect(() => {
    setMeta(null);
    if (!videoId) {
      setMetaLoading(false);
      return;
    }
    const controller = new AbortController();
    setMetaLoading(true);
    fetchVideoMeta(videoId, { signal: controller.signal }).then((found) => {
      if (controller.signal.aborted) return;
      setMeta(found);
      setMetaLoading(false);
    });
    return () => controller.abort();
  }, [videoId]);

  async function addTopic() {
    if (!text || busy) return;
    lab.audio.prime();
    setBusy(true);
    setError(null);
    try {
      if (video) {
        const title = meta?.title ?? UNTITLED_VIDEO;
        const topic = await addLearningTopic({ title });
        await addLearningResource({ topicId: topic.id, type: "youtube", title, url: video.watchUrl });
        lab.audio.play("pop");
        onQueryChange("");
        lab.openTopic(topic.id);
      } else {
        await addLearningTopic({ title: text });
        lab.audio.play("pop");
        onQueryChange("");
      }
    } catch {
      setError("לא הצלחנו להוסיף. נסה שוב.");
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && query) {
      onQueryChange("");
      return;
    }
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (video || matches.length === 0) void addTopic();
    else lab.openTopic(matches[0].id);
  }

  const hasText = text.length > 0;

  return (
    <section aria-label="רדאר סקרנות" className="relative">
      <GlowBorder active={focused || hasText} radius="rounded-3xl" seconds={4.2}>
        {/* The input keeps at least 15rem; the buttons drop to a second line
            before they would squeeze it, at any width. */}
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <div className="flex min-w-[15rem] flex-1 items-center gap-3 px-2">
            <Search size={18} className="shrink-0 text-accent-learning" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="חפש, הוסף נושא, או הדבק קישור YouTube…"
              aria-label="חיפוש והוספה של נושאי לימוד"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-foreground outline-none placeholder:text-muted"
            />
            <AnimatePresence>
              {hasText && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  onClick={() => {
                    onQueryChange("");
                    inputRef.current?.focus();
                  }}
                  aria-label="נקה"
                  className="focus-ring rounded-full p-1 text-muted transition-colors hover:text-foreground"
                >
                  <X size={15} aria-hidden />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <MagneticButton
              onClick={() => void addTopic()}
              disabled={!hasText || busy}
              aria-label={video ? "הוסף את הסרטון כנושא חדש" : "הוסף נושא חדש"}
              className="flex items-center gap-1.5 rounded-2xl bg-accent-learning px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Plus size={15} aria-hidden />}
              {video ? "הוסף סרטון" : "הוסף נושא"}
            </MagneticButton>

            <MagneticButton
              onClick={onSurprise}
              disabled={!canSurprise || rolling}
              aria-label="חפור בנושא אקראי"
              className="flex items-center gap-1.5 rounded-2xl border border-hairline-card bg-fill-subtle px-4 py-2.5 text-sm font-medium text-foreground transition-opacity disabled:opacity-40"
            >
              <motion.span
                className="grid place-items-center"
                animate={rolling && !reduce ? { rotate: 360 } : { rotate: 0 }}
                transition={rolling ? { duration: 0.6, ease: "linear", repeat: Infinity } : { type: "spring", bounce: 0.4 }}
              >
                <Shuffle size={15} className="text-accent-learning" aria-hidden />
              </motion.span>
              חפור בנושא אקראי
            </MagneticButton>
          </div>
        </div>
      </GlowBorder>

      {/* The pasted video, in a popover so it never pushes the page down. */}
      <AnimatePresence>
        {video && (
          <motion.div
            key={video.videoId}
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 22, scale: 0.86 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: "spring", bounce: 0.35, duration: 0.6 }}
            className="absolute inset-x-0 top-full z-20 mt-3 flex flex-col gap-4 overflow-hidden rounded-3xl border border-hairline-card bg-surface p-4 shadow-[0_24px_60px_-28px_rgba(16,16,20,0.45)] sm:flex-row"
          >
            <motion.div
              className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-fill-subtle sm:w-64"
              initial={{ scaleX: 0.55, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={{ type: "spring", bounce: 0.3, duration: 0.7, delay: 0.08 }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a YouTube thumbnail, sized by its container */}
              <img
                src={video.thumbnailUrl}
                alt=""
                className="size-full object-cover"
                onError={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
              />
              <span className="absolute inset-0 grid place-items-center bg-black/20">
                <span className="grid size-12 place-items-center rounded-full bg-white/90 text-black shadow-lg">
                  <Play size={20} className="ms-0.5" fill="currentColor" aria-hidden />
                </span>
              </span>
              {video.startSeconds > 0 && (
                <span className="ltr absolute bottom-2 end-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  מתחיל ב-{formatClock(video.startSeconds)}
                </span>
              )}
            </motion.div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <p className="text-xs font-medium text-accent-learning">זיהינו סרטון YouTube</p>
              {metaLoading ? (
                <div className="h-5 w-3/4 animate-pulse rounded bg-fill-subtle" aria-hidden />
              ) : (
                <h3 className={cn("line-clamp-2 text-base font-semibold leading-snug text-foreground", !meta && "text-muted")}>
                  {meta?.title ?? UNTITLED_VIDEO}
                </h3>
              )}
              {meta?.author && <p className="text-xs text-muted">{meta.author}</p>}
              <p className="text-xs text-muted">נהפוך אותו לנושא חדש עם הסרטון כמשאב הראשון, ונפתח אותו ללימוד.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-2 min-h-4 ps-3 text-xs text-muted" aria-live="polite">
        {error ? (
          <span className="text-accent-family">{error}</span>
        ) : video ? (
          "Enter — הוספת הסרטון"
        ) : hasText ? (
          matches.length === 0 ? (
            "אין נושא כזה עדיין — Enter כדי להוסיף אותו"
          ) : (
            `${matches.length} נושאים תואמים · Enter לפתיחת הראשון`
          )
        ) : null}
      </p>
    </section>
  );
}
