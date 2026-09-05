"use client";

import { useState } from "react";
import { ExternalLink, Loader2, NotebookPen, Plus, Video, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { nextOrder } from "@/lib/summaries/ordering";
import { youtubeVideoId } from "@/lib/learning/youtube";
import { cn } from "@/lib/utils";
import type { StudyItemKind, Summary } from "@/types";

interface AddStudyItemProps {
  /** Files the new item under a custom section. */
  sectionId?: string;
  /** Files it against a book or rabbi. */
  entityType?: Summary["entityType"];
  entityId?: string;
  /** Opens the rich editor instead of creating inline. */
  onWriteSummary: () => void;
}

const KINDS: { kind: Exclude<StudyItemKind, "summary">; label: string; icon: typeof Video; placeholder: string }[] = [
  { kind: "video", label: "שיעור וידאו", icon: Video, placeholder: "קישור YouTube" },
  { kind: "source", label: "מקור", icon: ExternalLink, placeholder: "קישור למקור" },
];

// Quick-add for the two item kinds that are essentially a title plus a link.
//
// Written summaries deliberately do not have an inline form here — they open
// the rich editor, because a one-line input would produce exactly the thin,
// unstructured notes the summary system was rebuilt to replace.
export function AddStudyItem({ sectionId, entityType, entityId, onWriteSummary }: AddStudyItemProps) {
  const summaries = useAtlasStore((s) => s.summaries);
  const addSummary = useAtlasStore((s) => s.addSummary);

  const [open, setOpen] = useState<Exclude<StudyItemKind, "summary"> | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setOpen(null);
    setTitle("");
    setUrl("");
    setError(null);
  }

  async function submit(kind: Exclude<StudyItemKind, "summary">) {
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle || !trimmedUrl) return;

    // Validate a video link before saving. Storing an unplayable URL means
    // the card renders an empty player later, with nothing explaining why.
    if (kind === "video" && !youtubeVideoId(trimmedUrl)) {
      setError("זה לא נראה כמו קישור YouTube תקין.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Ordered against the items it will actually sit beside, so a new item
      // lands at the end of its own list rather than of everything.
      const siblings = summaries
        .filter((s) =>
          sectionId ? s.sectionId === sectionId : s.entityType === entityType && s.entityId === entityId
        )
        .map((s) => ({ id: s.id, sortOrder: s.sortOrder ?? 0 }));

      await addSummary({
        title: trimmedTitle,
        content: "",
        kind,
        url: trimmedUrl,
        sectionId,
        entityType,
        entityId,
        sortOrder: nextOrder(siblings),
      });
      reset();
    } catch {
      setError("השמירה נכשלה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  if (open) {
    const config = KINDS.find((k) => k.kind === open)!;
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת"
            aria-label="כותרת הפריט"
            autoFocus
            className="focus-ring flex-1 rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(open)}
            placeholder={config.placeholder}
            aria-label={config.placeholder}
            dir="ltr"
            className="focus-ring ltr flex-1 rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />
        </div>

        {error && <p className="text-xs text-accent-family">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => submit(open)}
            disabled={!title.trim() || !url.trim() || saving}
            className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
          >
            {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Plus size={12} aria-hidden />}
            הוסף
          </button>
          <button
            onClick={reset}
            aria-label="בטל"
            className="focus-ring rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={onWriteSummary}
        className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground"
      >
        <NotebookPen size={13} className="text-accent-faith" aria-hidden />
        כתוב סיכום
      </button>
      {KINDS.map((k) => {
        const Icon = k.icon;
        return (
          <button
            key={k.kind}
            onClick={() => setOpen(k.kind)}
            className={cn(
              "glass-control-hover focus-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-muted transition-colors hover:text-foreground"
            )}
          >
            <Icon size={13} aria-hidden />
            {k.label}
          </button>
        );
      })}
    </div>
  );
}
