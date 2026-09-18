"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { isEntityType, type EntityRef } from "@/lib/summaries/entityRef";
import { sanitizeSummaryHtml } from "@/lib/summaries/sanitizeHtml";
import { buildAutoLinkTargets, linkifyHtml, linkifyText } from "@/lib/torah/autoLink";
import { SEFORIM_CATALOG } from "@/lib/torah/seforimCatalog";
import { useAtlasStore } from "@/store/useAtlasStore";

interface SummaryContentProps {
  /** Rich HTML from the editor. */
  html?: string;
  /** Plain text fallback for summaries written before the editor existed. */
  text?: string;
  className?: string;
  /** Makes @mention chips clickable. Omit to render them as plain chips. */
  onEntityClick?: (ref: EntityRef) => void;
  /**
   * The book whose page this note is shown on, so its own name is not linked
   * back to itself. Auto-linking is on whenever the content is navigable.
   */
  currentBookId?: string;
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
//
// When onEntityClick is supplied the mention chips become navigable, and book
// names written in plain prose ("כמו שכתוב בשולחן ערוך") are auto-linked to
// their pages (lib/torah/autoLink.ts). Auto-linking runs AFTER sanitising and
// only wraps text in a span with data attributes whose values are escaped, so
// it cannot reintroduce markup the sanitiser removed. The stored note is never
// modified.
export function SummaryContent({ html, text, className, onEntityClick, currentBookId }: SummaryContentProps) {
  const router = useRouter();
  const books = useAtlasStore((s) => s.books);
  const autoLink = Boolean(onEntityClick);

  const targets = useMemo(
    () => (autoLink ? buildAutoLinkTargets(books, SEFORIM_CATALOG, { excludeBookId: currentBookId }) : []),
    [autoLink, books, currentBookId]
  );

  const safe = useMemo(() => {
    if (!html) return null;
    const sanitized = sanitizeSummaryHtml(html);
    return targets.length > 0 ? linkifyHtml(sanitized, targets) : sanitized;
  }, [html, targets]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const chip of root.querySelectorAll<HTMLElement>(".entity-mention")) {
      if (onEntityClick) {
        chip.setAttribute("role", "link");
        chip.tabIndex = 0;
      } else {
        // Re-render with the handler removed must take the affordance away
        // too, or a stale chip keeps claiming to be a link.
        chip.removeAttribute("role");
        chip.removeAttribute("tabindex");
      }
    }
  }, [onEntityClick, safe]);

  // Delegated from the container: the chips are innerHTML, so there is no
  // React element to attach a handler to.
  const activate = useCallback(
    (target: EventTarget | null) => {
      if (!onEntityClick || !(target instanceof Element)) return;

      const autoLinkEl = target.closest<HTMLElement>(".auto-book-link");
      if (autoLinkEl) {
        const { autoBookId, autoBookTitle } = autoLinkEl.dataset;
        if (autoBookId) {
          onEntityClick({ type: "book", id: autoBookId, label: autoLinkEl.textContent ?? "" });
        } else if (autoBookTitle) {
          // Not on the shelf yet: the resolver adds it and opens its page.
          router.push(`/areas/torah/open?type=book&title=${encodeURIComponent(autoBookTitle)}`);
        }
        return;
      }

      const chip = target.closest<HTMLElement>(".entity-mention");
      if (!chip) return;
      const { entityType, entityId, label } = chip.dataset;
      // A dangling or malformed reference stays inert rather than navigating
      // somewhere arbitrary — the same tolerance resolveEntity is built on.
      if (!entityType || !entityId || !isEntityType(entityType)) return;
      onEntityClick({ type: entityType, id: entityId, label: label ?? "" });
    },
    [onEntityClick, router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      // Space would otherwise scroll the page out from under the link.
      if (e.target instanceof Element && e.target.closest(".entity-mention, .auto-book-link")) e.preventDefault();
      activate(e.target);
    }
  };

  if (safe) {
    return (
      <div
        ref={containerRef}
        className={`summary-content ${className ?? ""}`}
        dir="rtl"
        onClick={(e) => activate(e.target)}
        onKeyDown={onKeyDown}
        dangerouslySetInnerHTML={{ __html: safe }}
      />
    );
  }

  // Pre-editor summaries are plain text with meaningful line breaks.
  if (text?.trim()) {
    const segments = targets.length > 0 ? linkifyText(text, targets) : [{ kind: "text" as const, text }];
    return (
      <div
        className={`summary-content whitespace-pre-line ${className ?? ""}`}
        dir="rtl"
        onClick={(e) => activate(e.target)}
        onKeyDown={onKeyDown}
      >
        {segments.map((segment, i) =>
          segment.kind === "text" ? (
            segment.text
          ) : (
            <span
              key={i}
              className="auto-book-link"
              role="link"
              tabIndex={0}
              data-auto-book-id={segment.target.bookId}
              data-auto-book-title={segment.target.bookId ? undefined : segment.target.title}
            >
              {segment.text}
            </span>
          )
        )}
      </div>
    );
  }

  return <p className="text-xs text-muted">אין עדיין תוכן בסיכום הזה.</p>;
}
