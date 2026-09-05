"use client";

import { useMemo } from "react";
import { sanitizeSummaryHtml } from "@/lib/summaries/sanitizeHtml";

interface SummaryContentProps {
  /** Rich HTML from the editor. */
  html?: string;
  /** Plain text fallback for summaries written before the editor existed. */
  text?: string;
  className?: string;
}

// Renders a saved summary as structured text on an entity page.
//
// The HTML comes from this app's own editor, but it is still sanitised
// before rendering. It has made a round trip through the database, and
// dangerouslySetInnerHTML on anything that has left the process is how a
// stored-XSS bug happens — an imported .docx or a pasted fragment is
// attacker-influenced content even when the attacker is only a website the
// user copied from. The allowlist in lib/summaries/sanitizeHtml.ts is exactly
// the tag set the editor can produce, so nothing legitimate is lost.
export function SummaryContent({ html, text, className }: SummaryContentProps) {
  const safe = useMemo(() => (html ? sanitizeSummaryHtml(html) : null), [html]);

  if (safe) {
    return (
      <div
        className={`summary-content ${className ?? ""}`}
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  // Pre-editor summaries are plain text with meaningful line breaks.
  if (text?.trim()) {
    return (
      <div className={`summary-content whitespace-pre-line ${className ?? ""}`} dir="rtl">
        {text}
      </div>
    );
  }

  return <p className="text-xs text-muted">אין עדיין תוכן בסיכום הזה.</p>;
}
