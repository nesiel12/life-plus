"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { isEntityType, type EntityRef } from "@/lib/summaries/entityRef";
import { sanitizeSummaryHtml } from "@/lib/summaries/sanitizeHtml";

interface SummaryContentProps {
  /** Rich HTML from the editor. */
  html?: string;
  /** Plain text fallback for summaries written before the editor existed. */
  text?: string;
  className?: string;
  /** Makes @mention chips clickable. Omit to render them as plain chips. */
  onEntityClick?: (ref: EntityRef) => void;
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
// When onEntityClick is supplied the mention chips become navigable. The
// affordances (role, tabindex) are applied to the live DOM after render
// rather than baked into the stored HTML: keeping them out of the saved
// markup means the sanitiser's attribute allowlist stays as narrow as it is,
// and the same content renders inert wherever no host wires navigation up.
export function SummaryContent({ html, text, className, onEntityClick }: SummaryContentProps) {
  const safe = useMemo(() => (html ? sanitizeSummaryHtml(html) : null), [html]);
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
      const chip = target.closest<HTMLElement>(".entity-mention");
      if (!chip) return;
      const { entityType, entityId, label } = chip.dataset;
      // A dangling or malformed reference stays inert rather than navigating
      // somewhere arbitrary — the same tolerance resolveEntity is built on.
      if (!entityType || !entityId || !isEntityType(entityType)) return;
      onEntityClick({ type: entityType, id: entityId, label: label ?? "" });
    },
    [onEntityClick]
  );

  if (safe) {
    return (
      <div
        ref={containerRef}
        className={`summary-content ${className ?? ""}`}
        dir="rtl"
        onClick={(e) => activate(e.target)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            // Space would otherwise scroll the page out from under the chip.
            if (e.target instanceof Element && e.target.closest(".entity-mention")) e.preventDefault();
            activate(e.target);
          }
        }}
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
