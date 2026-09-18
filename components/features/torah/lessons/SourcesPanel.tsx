"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, BookOpenText, BookPlus, Gavel, Library, Loader2, Play, ScrollText, type LucideIcon } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { formatTimecode } from "@/lib/torah/lessons/timecode";
import { sefariaReadUrl } from "@/lib/torah/links";
import type { LessonSourceView } from "@/lib/torah/lessons/types";
import { cn } from "@/lib/utils";

interface SourcesPanelProps {
  sources: LessonSourceView[];
  onSeek: (seconds: number) => void;
  /** Called after a cited work is added to the library, so the lesson reloads its links. */
  onLibraryChanged: () => void;
}

const KIND: Record<LessonSourceView["kind"], { label: string; icon: LucideIcon; tone: string }> = {
  verse: { label: "תנ״ך", icon: ScrollText, tone: "bg-accent-knowledge/12 text-accent-knowledge" },
  talmud: { label: "גמרא", icon: BookOpenText, tone: "bg-accent-faith/12 text-accent-faith" },
  halacha: { label: "הלכה", icon: Gavel, tone: "bg-accent-learning/12 text-accent-learning" },
  book: { label: "ספרים", icon: BookOpen, tone: "bg-gold-soft text-gold-ink" },
  other: { label: "אחר", icon: Library, tone: "bg-fill text-muted" },
};

type Filter = "all" | LessonSourceView["kind"];

/**
 * The Sources Panel: every verse, daf, halacha and sefer the speaker cited, as
 * navigation — to the moment it was said, to the actual text, and into the
 * user's own library.
 *
 * A source Sefaria confirmed shows its Hebrew text; one it could not confirm
 * is shown as heard and marked uncertain, never dressed up as verified.
 */
export function SourcesPanel({ sources, onSeek, onLibraryChanged }: SourcesPanelProps) {
  const books = useAtlasStore((s) => s.books);
  const openOrCreateBook = useAtlasStore((s) => s.openOrCreateBook);
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const map = new Map<Filter, number>([["all", sources.length]]);
    for (const source of sources) map.set(source.kind, (map.get(source.kind) ?? 0) + 1);
    return map;
  }, [sources]);

  const visible = filter === "all" ? sources : sources.filter((s) => s.kind === filter);
  const filters: Filter[] = ["all", ...(["verse", "talmud", "halacha", "book", "other"] as const).filter((k) => counts.get(k))];

  if (sources.length === 0) {
    return (
      <SectionPlaceholder icon={Library} title="לא זוהו מקורות" body="כשהמרצה מצטט פסוק, גמרא או הלכה — המקור יופיע כאן עם הטקסט המלא." />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {filters.length > 2 && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סינון מקורות">
          {filters.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-1 text-xs transition-colors",
                filter === key ? "bg-foreground text-background" : "bg-fill-subtle text-muted hover:text-foreground"
              )}
            >
              {key === "all" ? "הכל" : KIND[key].label}
              <span className="ltr ms-1 tabular-nums opacity-70">{counts.get(key)}</span>
            </button>
          ))}
        </div>
      )}

      <ul className="flex flex-col gap-2.5">
        {visible.map((source) => {
          const kind = KIND[source.kind];
          const Icon = kind.icon;
          const book = source.bookId ? books.find((b) => b.id === source.bookId) : undefined;
          const title = source.heRef ?? source.reference ?? source.rawCitation;
          const verified = Boolean(source.sefariaRef);
          const isOpen = expanded.has(source.id);

          return (
            <li key={source.id} className="rounded-2xl border border-hairline-card bg-surface p-3.5">
              <div className="flex items-start gap-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", kind.tone)} aria-hidden>
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
                  {source.rawCitation !== title && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">״{source.rawCitation}״</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.65rem]">
                    {source.atSeconds !== null && (
                      <button
                        type="button"
                        onClick={() => onSeek(source.atSeconds!)}
                        className="focus-ring flex items-center gap-1 rounded-full bg-gold-soft px-2 py-0.5 font-medium text-gold-ink"
                        aria-label={`נגן מ-${formatTimecode(source.atSeconds)}`}
                      >
                        <Play size={9} className="fill-current" aria-hidden />
                        <span className="ltr tabular-nums">{formatTimecode(source.atSeconds)}</span>
                      </button>
                    )}
                    {source.mentions > 1 && <span className="rounded-full bg-fill px-2 py-0.5 text-muted">הוזכר {source.mentions} פעמים</span>}
                    {!verified && <span className="rounded-full bg-fill px-2 py-0.5 text-muted">לא אומת</span>}
                  </div>
                </div>
              </div>

              {source.quotedText && (
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(source.id)) next.delete(source.id);
                      else next.add(source.id);
                      return next;
                    })
                  }
                  className="focus-ring mt-2.5 block w-full rounded-xl border-s-2 border-gold-line bg-surface-sunken/60 px-3 py-2 text-start"
                  aria-expanded={isOpen}
                >
                  <span className={cn("block text-[0.95rem] leading-8 text-foreground/85", !isOpen && "line-clamp-3")}>
                    {source.quotedText}
                  </span>
                </button>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {book ? (
                  <Link
                    href={`/areas/torah/books/${book.id}`}
                    className="focus-ring flex items-center gap-1 rounded-full border border-gold-line bg-gold-soft/50 px-2.5 py-1 text-xs text-gold-ink"
                  >
                    <BookOpen size={12} aria-hidden />
                    {book.hebrewTitle ?? book.title} · בספרייה שלך
                  </Link>
                ) : (
                  source.heIndexTitle && (
                    <button
                      type="button"
                      disabled={adding !== null}
                      onClick={async () => {
                        setAdding(source.id);
                        try {
                          await openOrCreateBook({ title: source.heIndexTitle!, sefariaTitle: source.sefariaIndex ?? undefined });
                          onLibraryChanged();
                        } finally {
                          setAdding(null);
                        }
                      }}
                      className="focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1 text-xs text-foreground/80 hover:border-gold-line disabled:opacity-50"
                    >
                      {adding === source.id ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <BookPlus size={12} aria-hidden />}
                      הוסף את «{source.heIndexTitle}» לספרייה
                    </button>
                  )
                )}
                {source.sefariaRef && (
                  <a
                    href={sefariaReadUrl(source.sefariaRef)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1 text-xs text-foreground/80 hover:border-gold-line"
                  >
                    <BookOpenText size={12} aria-hidden />
                    בספריא
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
