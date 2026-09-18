"use client";

import { useMemo } from "react";
import { ExternalLink, Headphones, Trash2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { AddStudyItem } from "@/components/features/torah/AddStudyItem";
import { PageSection, SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { webSearchUrl } from "@/lib/torah/links";

interface AudioLessonsSectionProps {
  entityType: "book" | "rabbi";
  entityId: string;
  name: string;
  delay?: number;
}

/**
 * Audio shiurim filed on a Book or Rabbi page.
 *
 * An audio lesson is a link to a hosted file for now — Kol HaLashon, a
 * yeshiva's archive — stored as a study item like videos are. Uploading and
 * transcribing long recordings is the Phase 3 lessons pipeline (background
 * jobs in scripts/cron.ts); when it lands, its lessons join this list.
 */
export function AudioLessonsSection({ entityType, entityId, name, delay }: AudioLessonsSectionProps) {
  const summaries = useAtlasStore((s) => s.summaries);
  const deleteSummary = useAtlasStore((s) => s.deleteSummary);

  const audios = useMemo(
    () => summaries.filter((s) => s.kind === "audio" && s.entityType === entityType && s.entityId === entityId && s.url),
    [summaries, entityType, entityId]
  );

  return (
    <PageSection
      id="audio"
      icon={Headphones}
      tone="learning"
      title="שיעורי אודיו"
      subtitle={`הקלטות של שיעורים על ${name}`}
      delay={delay}
    >
      <div className="flex flex-col gap-3">
        {audios.length === 0 ? (
          <SectionPlaceholder
            icon={Headphones}
            title="עדיין אין שיעורי אודיו"
            body="הדבק קישור לקובץ שמע של שיעור, והוא יתנגן כאן — בדרך, בהליכה, או לפני הלימוד."
          >
            <a
              href={webSearchUrl(`שיעור אודיו ${name}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs text-foreground/80 hover:border-gold-line"
            >
              חפש שיעורי אודיו
              <ExternalLink size={11} className="text-muted" aria-hidden />
            </a>
          </SectionPlaceholder>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {audios.map((audio) => (
              <li key={audio.id} className="rounded-xl border border-hairline-card bg-surface-sunken/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                    <Headphones size={13} className="shrink-0 text-accent-learning" aria-hidden />
                    <span className="truncate">{audio.title}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => void deleteSummary(audio.id).catch(() => {})}
                    aria-label={`הסר את ${audio.title}`}
                    className="focus-ring rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={12} aria-hidden />
                  </button>
                </div>
                {/* preload="none": no hours of audio downloading before play. */}
                <audio controls preload="none" src={audio.url} className="h-9 w-full" aria-label={audio.title} />
              </li>
            ))}
          </ul>
        )}

        <AddStudyItem
          entityType={entityType}
          entityId={entityId}
          onWriteSummary={() => {}}
          kinds={["audio"]}
          hideWriteSummary
        />
      </div>
    </PageSection>
  );
}
