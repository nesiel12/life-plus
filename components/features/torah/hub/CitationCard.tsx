"use client";

import { BadgeCheck, BookOpenText, CircleHelp, Quote } from "lucide-react";

export interface Citation {
  reference: string;
  note: string;
  verified: boolean;
  sefariaRef: string | null;
  sefariaUrl: string | null;
  quotedText: string | null;
}

/**
 * One source under an AI answer — shared by the book assistant and the Havruta.
 *
 * A reference Sefaria verified and one it could not must never look the same:
 * the badge says which, and only a verified one shows the text it points to.
 */
export function CitationCard({ citation }: { citation: Citation }) {
  return (
    <li className="rounded-xl bg-surface-sunken/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Quote size={11} className="text-gold-ink" aria-hidden />
          {citation.reference}
        </p>
        {citation.verified ? (
          <span className="flex items-center gap-1 rounded-full bg-accent-health/12 px-2 py-0.5 text-[0.62rem] font-medium text-accent-health">
            <BadgeCheck size={11} aria-hidden />
            אומת מול ספריא
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-fill px-2 py-0.5 text-[0.62rem] text-muted">
            <CircleHelp size={11} aria-hidden />
            לא אומת
          </span>
        )}
      </div>
      {citation.note && <p className="mt-1 text-xs text-foreground/75">{citation.note}</p>}
      {citation.quotedText && (
        <p className="mt-2 border-s-2 border-gold-line ps-2.5 text-xs leading-relaxed text-foreground/75">
          {citation.quotedText}
        </p>
      )}
      {citation.sefariaUrl && (
        <a
          href={citation.sefariaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring mt-2 inline-flex items-center gap-1 text-xs text-gold-ink underline-offset-2 hover:underline"
        >
          <BookOpenText size={12} aria-hidden />
          פתח את המקור בספריא
        </a>
      )}
    </li>
  );
}
