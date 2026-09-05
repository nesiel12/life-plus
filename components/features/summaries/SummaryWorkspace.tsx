"use client";

import { useCallback, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { SummaryEditor, type SummaryDraft } from "@/components/features/summaries/SummaryEditor";
import type { EntitySources } from "@/lib/summaries/entityRef";
import type { Summary } from "@/types";

interface SummaryWorkspaceProps {
  /** Resuming an existing summary, or undefined to start a new one. */
  existing?: Summary;
  /** The entity this summary is about, when opened from an entity page. */
  entityType?: Summary["entityType"];
  entityId?: string;
  onClose: () => void;
}

// Owns the create-vs-update decision behind the editor.
//
// The subtle part is the first autosave. A new summary has no row yet, so the
// first save must INSERT and every save after it must UPDATE — without that,
// each debounce tick would insert another copy of the same draft and the user
// would end up with a dozen near-identical rows. The id is held in a ref
// rather than state because the autosave callback closes over it and must see
// the value written by the previous save, not the one from its own render.
export function SummaryWorkspace({ existing, entityType, entityId, onClose }: SummaryWorkspaceProps) {
  const books = useAtlasStore((s) => s.books);
  const rabbis = useAtlasStore((s) => s.rabbis);
  const people = useAtlasStore((s) => s.people);
  const addSummary = useAtlasStore((s) => s.addSummary);
  const updateSummary = useAtlasStore((s) => s.updateSummary);

  const summaryId = useRef<string | null>(existing?.id ?? null);
  const [closing, setClosing] = useState(false);

  const sources: EntitySources = { books, rabbis, people };

  const persist = useCallback(
    async (draft: SummaryDraft, isDraft: boolean) => {
      const payload = {
        title: draft.title.trim() || "סיכום ללא כותרת",
        content: draft.text,
        contentHtml: draft.html,
        isDraft,
        entityType,
        entityId,
        mentions: draft.mentions,
      };

      if (summaryId.current) {
        await updateSummary(summaryId.current, payload);
      } else {
        const created = await addSummary(payload);
        summaryId.current = created.id;
      }
    },
    [addSummary, updateSummary, entityType, entityId]
  );

  // Autosaves land as drafts; only an explicit finish clears the flag. That
  // is what lets someone stop mid-sentence, close the tab, and find the work
  // marked unfinished rather than silently filed as complete.
  const handleAutoSave = useCallback((draft: SummaryDraft) => persist(draft, true), [persist]);

  const handleSave = useCallback(
    async (draft: SummaryDraft) => {
      await persist(draft, false);
      setClosing(true);
      onClose();
    },
    [persist, onClose]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <FileText size={16} className="text-accent-knowledge" aria-hidden />
          {existing ? "המשך סיכום" : "סיכום חדש"}
        </p>
        <button
          onClick={onClose}
          disabled={closing}
          aria-label="סגור את העורך"
          className="glass-control focus-ring grid size-8 place-items-center rounded-lg text-foreground"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <SummaryEditor
        initialTitle={existing?.title ?? ""}
        // Falls back to the plain-text body so a summary written before the
        // editor existed opens with its content intact rather than blank.
        initialHtml={existing?.contentHtml ?? (existing?.content ? `<p>${existing.content}</p>` : undefined)}
        sources={sources}
        onAutoSave={handleAutoSave}
        onSave={handleSave}
      />
    </div>
  );
}
