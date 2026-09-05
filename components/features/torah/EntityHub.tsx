"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, GraduationCap, Link2, NotebookPen } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { AddStudyItem } from "@/components/features/torah/AddStudyItem";
import { StudyItemList } from "@/components/features/torah/StudyItemList";
import { SummaryWorkspace } from "@/components/features/summaries/SummaryWorkspace";
import { buildStudyHub, type HubItem } from "@/lib/torah/studyHub";
import type { EntityRef, EntitySources } from "@/lib/summaries/entityRef";
import { cn } from "@/lib/utils";

interface EntityHubProps {
  entityType: "book" | "rabbi";
  entityId: string;
  name: string;
  /** Author for a book, title for a rabbi. */
  subtitle?: string;
  onBack: () => void;
  /** Following an @mention out of this hub. The page owns where that goes. */
  onEntityClick?: (ref: EntityRef) => void;
}

type HubTab = "all" | "summaries" | "videos" | "sources";

// The one-stop hub behind clicking a book or a rabbi.
//
// One component for both, because the two views differ only in labels and
// icon — the aggregation, ordering, tabs, creation and editing are
// identical. Two near-copies would drift the moment either was touched.
//
// Everything shown comes from buildStudyHub (pure, tested), which collects
// material filed *about* the entity and material that merely @mentions it,
// and marks which is which — so a note about another book that quotes this
// rabbi shows up here, labelled, rather than being invisible.
export function EntityHub({ entityType, entityId, name, subtitle, onBack, onEntityClick }: EntityHubProps) {
  const summaries = useAtlasStore((s) => s.summaries);
  const knowledgeEntries = useAtlasStore((s) => s.knowledgeEntries);
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const people = useAtlasStore((s) => s.people);
  const sections = useAtlasStore((s) => s.summarySections);
  const deleteSummary = useAtlasStore((s) => s.deleteSummary);
  const reorderSummaryInSection = useAtlasStore((s) => s.reorderSummaryInSection);

  const [tab, setTab] = useState<HubTab>("all");
  const [editorTarget, setEditorTarget] = useState<string | null>(null);

  // Passed to the aggregator so each item can say where it actually lives.
  const sources: EntitySources = useMemo(
    () => ({ books, rabbis, people, sections }),
    [books, rabbis, people, sections]
  );

  const hub = useMemo(
    () => buildStudyHub({ entityType, entityId, entityName: name, summaries, knowledgeEntries, sources }),
    [entityType, entityId, name, summaries, knowledgeEntries, sources]
  );

  const visible: HubItem[] = useMemo(() => {
    const pick =
      tab === "summaries" ? hub.summaries : tab === "videos" ? hub.videos : tab === "sources" ? hub.sources : null;
    if (pick) return pick;
    // "All" keeps the kind grouping rather than interleaving — written
    // material first, then lessons, then sources, which is the order a
    // person actually studies in.
    return [...hub.summaries, ...hub.videos, ...hub.sources];
  }, [tab, hub]);

  const TABS: { key: HubTab; label: string; count: number }[] = [
    { key: "all", label: "הכל", count: hub.summaries.length + hub.videos.length + hub.sources.length },
    { key: "summaries", label: "סיכומים", count: hub.summaries.length },
    { key: "videos", label: "שיעורים", count: hub.videos.length },
    { key: "sources", label: "מקורות", count: hub.sources.length },
  ];

  const Icon = entityType === "book" ? BookOpen : GraduationCap;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-faith/15 text-accent-faith">
            <Icon size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-medium text-foreground">{name}</h2>
            {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        <button
          onClick={onBack}
          className="glass-control focus-ring flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-foreground"
        >
          <ArrowRight size={13} aria-hidden />
          חזרה
        </button>
      </div>

      <div role="tablist" aria-label="תוכן" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "focus-ring rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.key
                ? "glass-control glass-control-active text-foreground"
                : "glass-control-hover text-muted hover:text-foreground"
            )}
          >
            {t.label}
            <span className="ltr ms-1.5 tabular-nums text-muted">{t.count}</span>
          </button>
        ))}
      </div>

      {editorTarget !== null ? (
        <SummaryWorkspace
          existing={editorTarget === "new" ? undefined : summaries.find((s) => s.id === editorTarget)}
          entityType={entityType}
          entityId={entityId}
          onClose={() => setEditorTarget(null)}
        />
      ) : (
        <AddStudyItem
          entityType={entityType}
          entityId={entityId}
          onWriteSummary={() => setEditorTarget("new")}
        />
      )}

      <StudyItemList
        items={visible}
        onDelete={(id) => deleteSummary(id).catch(() => {})}
        onEdit={(id) => setEditorTarget(id)}
        onMove={(id, delta) => reorderSummaryInSection(id, delta).catch(() => {})}
        onEntityClick={onEntityClick}
        emptyLabel={
          entityType === "book"
            ? "אין עדיין חומרים לספר הזה. הוסף סיכום, שיעור או מקור."
            : "אין עדיין חומרים לרב הזה. הוסף סיכום, שיעור או מקור."
        }
      />

      {/* Knowledge entries have no entity link, so they are matched by name
          and shown separately — presenting them as filed material would
          overstate the connection. */}
      {hub.relatedEntries.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-hairline-card pt-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Link2 size={12} aria-hidden />
            רשומות ידע שמזכירות את {name}
          </p>
          <ul className="flex flex-col gap-1.5">
            {hub.relatedEntries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 text-xs text-foreground/80">
                <NotebookPen size={11} className="shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{entry.topic}</span>
                <span className="ltr shrink-0 text-muted">{entry.date}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
