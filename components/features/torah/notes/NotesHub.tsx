"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, BookOpen, GraduationCap, NotebookPen, Plus, Search, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { SummaryContent } from "@/components/features/summaries/SummaryContent";
import { SummaryWorkspace } from "@/components/features/summaries/SummaryWorkspace";
import { AudioAttachmentWidget } from "@/components/features/torah/attachments/AudioAttachmentWidget";
import { ScanNoteButton } from "@/components/features/torah/scan/HandwritingScanner";
import { SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { useAtlasStore } from "@/store/useAtlasStore";
import { normalizeTerm } from "@/lib/torah/normalizeTerm";
import { cn } from "@/lib/utils";
import type { Summary } from "@/types";

type Filter = "all" | "unfiled" | "book" | "rabbi";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "unfiled", label: "לא משויכים" },
  { key: "book", label: "על ספרים" },
  { key: "rabbi", label: "על רבנים" },
];

/**
 * "הסיכומים שלי" — the personal notes hub.
 *
 * The one place every written note lives, whichever page it was written on:
 * notes filed on a book or a rabbi, notes that belong to nothing in
 * particular, and pages scanned from handwriting. Opening a note gives it the
 * editor and its own recordings, so a note, its source page and the audio
 * behind it sit together.
 */
export function NotesHub() {
  const reduceMotion = useReducedMotion();
  const summaries = useAtlasStore((s) => s.summaries);
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const deleteSummary = useAtlasStore((s) => s.deleteSummary);

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openNote, setOpenNote] = useState<string | "new" | null>(null);

  const entityName = useMemo(() => {
    const names = new Map<string, string>();
    for (const book of books) names.set(`book:${book.id}`, book.title);
    for (const rabbi of rabbis) names.set(`rabbi:${rabbi.id}`, rabbi.name);
    return names;
  }, [books, rabbis]);

  const notes = useMemo(() => {
    const needle = normalizeTerm(query.trim());
    return summaries
      .filter((note) => (note.kind ?? "summary") === "summary")
      .filter((note) => {
        if (filter === "unfiled") return !note.entityType;
        if (filter === "book" || filter === "rabbi") return note.entityType === filter;
        return true;
      })
      .filter((note) => {
        if (!needle) return true;
        return normalizeTerm(`${note.title} ${note.content}`).includes(needle);
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [summaries, filter, query]);

  const active = openNote && openNote !== "new" ? summaries.find((note) => note.id === openNote) : undefined;

  return (
    <main className="min-h-screen px-4 py-10 sm:px-10 sm:py-14 lg:px-16">
      <Link
        href="/areas/torah"
        className="focus-ring glass-control-hover -ms-2.5 mb-5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
      >
        <ArrowRight size={14} aria-hidden />
        מרחב תורה
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
            <NotebookPen size={13} aria-hidden />
            הסיכומים שלי
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">סיכומים והערות</h1>
          <p className="text-sm text-muted">כל מה שכתבת, סרקת או הקלטת — במקום אחד.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScanNoteButton target={{ type: "note", label: "הסיכומים שלי" }} variant="gold" />
          <button
            type="button"
            onClick={() => setOpenNote("new")}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs font-medium text-foreground/85 hover:border-gold-line"
          >
            <Plus size={13} aria-hidden />
            סיכום חדש
          </button>
        </div>
      </header>

      {openNote ? (
        <div className="flex flex-col gap-5">
          <GlassCard>
            <SummaryWorkspace
              existing={active}
              entityType={active?.entityType}
              entityId={active?.entityId}
              onClose={() => setOpenNote(null)}
            />
          </GlassCard>

          {active && (
            <GlassCard>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <NotebookPen size={14} className="text-gold-ink" aria-hidden />
                הקלטות על הסיכום הזה
              </h2>
              <AudioAttachmentWidget entityType="summary" entityId={active.id} entityLabel={active.title} compact />
            </GlassCard>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-hairline-card bg-surface px-3 py-2 focus-within:border-gold-line sm:max-w-sm">
              <Search size={15} className="text-muted" aria-hidden />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חפש בסיכומים…"
                aria-label="חיפוש בסיכומים"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={cn(
                    "focus-ring rounded-full border px-3 py-1.5 text-xs transition-colors",
                    filter === key
                      ? "border-gold-line bg-gold-soft text-foreground"
                      : "border-hairline-card bg-surface text-foreground/80 hover:border-gold-line"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {notes.length === 0 ? (
            <SectionPlaceholder
              icon={NotebookPen}
              title={query ? "אין סיכום שמתאים לחיפוש" : "עוד אין סיכומים"}
              body={query ? undefined : "כתוב סיכום חדש, או צלם דף מכתב היד ותן לנו להמיר אותו לטקסט."}
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {notes.map((note, index) => (
                <motion.li
                  key={note.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
                >
                  <NoteCard
                    note={note}
                    entityLabel={
                      note.entityType && note.entityId ? entityName.get(`${note.entityType}:${note.entityId}`) : undefined
                    }
                    onOpen={() => setOpenNote(note.id)}
                    onDelete={() => deleteSummary(note.id).catch(() => undefined)}
                  />
                </motion.li>
              ))}
            </ul>
          )}
        </div>
      )}
    </main>
  );
}

function NoteCard({
  note,
  entityLabel,
  onOpen,
  onDelete,
}: {
  note: Summary;
  entityLabel?: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const Icon = note.entityType === "rabbi" ? GraduationCap : BookOpen;
  return (
    <div className="glass-card flex h-full flex-col gap-2 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onOpen} className="focus-ring min-w-0 flex-1 text-start">
          <p className="truncate text-sm font-semibold text-foreground">{note.title}</p>
          <p className="text-[0.7rem] text-muted">{note.date}</p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`למחוק את "${note.title}"?`)) onDelete();
          }}
          aria-label="מחק סיכום"
          className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>

      <button type="button" onClick={onOpen} className="focus-ring min-h-0 flex-1 text-start">
        <div className="line-clamp-4 text-xs leading-relaxed text-foreground/75">
          <SummaryContent html={note.contentHtml} text={note.content} />
        </div>
      </button>

      {entityLabel && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-foreground/75">
          <Icon size={10} aria-hidden />
          {entityLabel}
        </span>
      )}
    </div>
  );
}
