"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Crosshair, Search, X } from "lucide-react";
import { activeLineIndex, type TranscriptLine } from "@/lib/torah/lessons/transcript";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { normalizeTerm } from "@/lib/torah/normalizeTerm";
import type { LessonChapterView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

interface InteractiveTranscriptProps {
  lines: TranscriptLine[];
  chapters: LessonChapterView[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}

/** Wraps every occurrence of the query in <mark>, matching like the search does. */
function highlight(text: string, query: string) {
  if (!query) return text;
  const pattern = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded bg-gold/35 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

/**
 * The transcript as a way to move through the shiur: the sentence being said
 * is highlighted and kept in view, any sentence can be clicked to jump there,
 * chapter titles break the text where the topic changes, and a search finds a
 * word and steps through every place it was said.
 *
 * Following pauses for a few seconds whenever the reader scrolls on their own,
 * so reading ahead is not fought by the auto-scroll.
 */
export function InteractiveTranscript({ lines, chapters, currentTime, onSeek }: InteractiveTranscriptProps) {
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(0);
  const [following, setFollowing] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const programmaticScroll = useRef(false);

  const active = activeLineIndex(lines, currentTime);
  const chapterStarts = useMemo(() => new Map(chapters.map((c) => [c.startSeconds, c])), [chapters]);

  const trimmed = query.trim();
  const matches = useMemo(() => {
    if (trimmed.length < 2) return [];
    const needle = normalizeTerm(trimmed);
    return lines.flatMap((line, index) => (normalizeTerm(line.text).includes(needle) ? [index] : []));
  }, [lines, trimmed]);

  useEffect(() => setMatchCursor(0), [trimmed]);

  function scrollToLine(index: number) {
    const container = containerRef.current;
    const element = container?.querySelector<HTMLElement>(`[data-line="${index}"]`);
    if (!container || !element) return;
    programmaticScroll.current = true;
    const top = element.offsetTop - container.clientHeight / 3;
    container.scrollTo({ top, behavior: "smooth" });
    window.setTimeout(() => (programmaticScroll.current = false), 500);
  }

  useEffect(() => {
    if (!following || active < 0 || trimmed) return;
    if (Date.now() - lastManualScroll.current < 4000) return;
    scrollToLine(active);
  }, [active, following, trimmed]);

  useEffect(() => {
    if (matches.length > 0) scrollToLine(matches[Math.min(matchCursor, matches.length - 1)]);
  }, [matches, matchCursor]);

  // Chapters a line starts at or after, so a heading shows before the first
  // line of each chapter even when no line starts on the exact second.
  const headingBefore = useMemo(() => {
    const map = new Map<number, LessonChapterView>();
    const sorted = [...chapters].sort((a, b) => a.startSeconds - b.startSeconds);
    let cursor = 0;
    lines.forEach((line, index) => {
      while (cursor < sorted.length && sorted[cursor].startSeconds <= line.start) {
        map.set(index, sorted[cursor]);
        cursor++;
      }
    });
    return map;
  }, [lines, chapters]);

  if (lines.length === 0) {
    return <p className="text-sm text-muted">אין עדיין תמלול לשיעור הזה.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-hairline-card bg-surface px-3 py-2 focus-within:border-gold-line">
          <Search size={14} className="shrink-0 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches.length) {
                e.preventDefault();
                setMatchCursor((c) => (e.shiftKey ? (c - 1 + matches.length) % matches.length : (c + 1) % matches.length));
              }
              if (e.key === "Escape") setQuery("");
            }}
            placeholder="חיפוש בתמלול…"
            aria-label="חיפוש בתמלול"
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
          {trimmed.length >= 2 && (
            <span className="shrink-0 text-xs text-muted">
              {matches.length ? (
                <span className="ltr tabular-nums">
                  {Math.min(matchCursor, matches.length - 1) + 1}/{matches.length}
                </span>
              ) : (
                "אין תוצאות"
              )}
            </span>
          )}
          {matches.length > 1 && (
            <>
              <button
                type="button"
                aria-label="התוצאה הקודמת"
                onClick={() => setMatchCursor((c) => (c - 1 + matches.length) % matches.length)}
                className="focus-ring rounded p-0.5 text-muted hover:text-foreground"
              >
                <ChevronUp size={14} aria-hidden />
              </button>
              <button
                type="button"
                aria-label="התוצאה הבאה"
                onClick={() => setMatchCursor((c) => (c + 1) % matches.length)}
                className="focus-ring rounded p-0.5 text-muted hover:text-foreground"
              >
                <ChevronDown size={14} aria-hidden />
              </button>
            </>
          )}
          {query && (
            <button type="button" aria-label="נקה חיפוש" onClick={() => setQuery("")} className="focus-ring rounded p-0.5 text-muted">
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => {
            setFollowing((f) => !f);
            lastManualScroll.current = 0;
            if (!following && active >= 0) scrollToLine(active);
          }}
          aria-pressed={following}
          className={cn(
            "focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors",
            following ? "border-gold-line bg-gold-soft text-gold-ink" : "border-hairline-card text-muted hover:text-foreground"
          )}
        >
          <Crosshair size={13} aria-hidden />
          עקוב אחרי ההקלטה
        </button>
      </div>

      <div
        ref={containerRef}
        onScroll={() => {
          if (!programmaticScroll.current) lastManualScroll.current = Date.now();
        }}
        className="relative max-h-[62vh] overflow-y-auto rounded-2xl border border-hairline-card bg-surface p-2 sm:p-3"
      >
        {lines.map((line, index) => {
          const heading = headingBefore.get(index) ?? chapterStarts.get(line.start);
          const isActive = index === active;
          const isMatch = matches.length > 0 && matches[Math.min(matchCursor, matches.length - 1)] === index;
          return (
            <Fragment key={`${line.start}-${index}`}>
              {heading && headingBefore.get(index) === heading && (
                <button
                  type="button"
                  onClick={() => onSeek(heading.startSeconds)}
                  className="focus-ring sticky top-0 z-[1] mb-1 mt-3 flex w-full items-center gap-2 rounded-lg bg-surface/95 px-2 py-1.5 text-start backdrop-blur first:mt-0"
                >
                  <span className="ltr rounded-md bg-gold-soft px-1.5 py-0.5 text-[0.65rem] font-medium tabular-nums text-gold-ink">
                    {formatTimecode(heading.startSeconds)}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{heading.title}</span>
                </button>
              )}
              <button
                type="button"
                data-line={index}
                onClick={() => onSeek(line.start)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "focus-ring group flex w-full gap-3 rounded-xl px-2 py-1.5 text-start transition-colors",
                  isActive ? "bg-gold-soft" : "hover:bg-fill-subtle",
                  isMatch && "ring-2 ring-gold-line"
                )}
              >
                <span
                  className={cn(
                    "ltr mt-1 w-11 shrink-0 text-[0.68rem] tabular-nums",
                    isActive ? "font-medium text-gold-ink" : "text-muted group-hover:text-foreground/70"
                  )}
                >
                  {formatTimecode(line.start)}
                </span>
                <span className={cn("text-[0.95rem] leading-7", isActive ? "text-foreground" : "text-foreground/80")}>
                  {highlight(line.text, trimmed.length >= 2 ? trimmed : "")}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
