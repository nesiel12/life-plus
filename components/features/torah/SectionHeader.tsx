"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";
import type { SummarySection } from "@/types";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  section: SummarySection;
  /** How many study items are filed here — shown in the delete confirmation,
   *  because "this section has 12 items in it" changes the decision. */
  itemCount: number;
  onRename: (name: string) => Promise<void>;
  onTogglePin: () => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Rename / pin / delete for the custom section you are currently standing in.
 *
 * These operations already existed — but only inside SectionManager, which is
 * rendered on the built-in "סיכומים" tab behind an "ארגן" toggle. A user who
 * created a section (say "הרב דוד פנדל"), opened it, and wanted to fix its
 * name or remove it had no control anywhere on that screen; the only path was
 * to leave, switch tabs, and find it in a manager they had no reason to know
 * about. This puts the same three actions where the section actually is.
 *
 * Deleting a section does not delete its contents — `summaries.section_id` is
 * ON DELETE SET NULL, so filed items become unassigned and sub-sections are
 * promoted to top level. The confirmation says so, because "delete" next to a
 * list of 12 summaries reads like it will take them with it.
 */
export function SectionHeader({
  section,
  itemCount,
  onRename,
  onTogglePin,
  onDelete,
}: SectionHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(section.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A rename left open while the user switches sections would otherwise
  // submit the previous section's draft into the new one.
  useEffect(() => {
    setRenaming(false);
    setConfirmingDelete(false);
    setError(null);
    setDraft(section.name);
  }, [section.id, section.name]);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  function submitRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === section.name) {
      setRenaming(false);
      setDraft(section.name);
      return;
    }
    run(async () => {
      await onRename(trimmed);
      setRenaming(false);
    }, "לא הצלחנו לשנות את שם המדור.");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") {
                  setRenaming(false);
                  setDraft(section.name);
                }
              }}
              aria-label="שם המדור"
              maxLength={80}
              className="focus-ring min-w-0 flex-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-sm text-foreground"
            />
            <button
              onClick={submitRename}
              disabled={busy}
              aria-label="שמור שם"
              className="focus-ring glass-control-hover grid size-7 place-items-center rounded-lg text-accent-health disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
            </button>
            <button
              onClick={() => {
                setRenaming(false);
                setDraft(section.name);
              }}
              aria-label="בטל שינוי שם"
              className="focus-ring glass-control-hover grid size-7 place-items-center rounded-lg text-muted"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ) : (
          <h2 className="flex min-w-0 items-center gap-2 text-lg font-medium tracking-tight text-foreground">
            <span className="truncate">{section.name}</span>
            {section.pinnedAt && <Pin size={13} className="shrink-0 text-gold-ink" aria-label="מדור מוצמד" />}
          </h2>
        )}

        {!renaming && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              onClick={() => setRenaming(true)}
              aria-label="שנה את שם המדור"
              title="שנה שם"
              className="focus-ring glass-control-hover grid size-8 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
            >
              <Pencil size={14} aria-hidden />
            </button>
            <button
              onClick={() => run(onTogglePin, "לא הצלחנו לעדכן את ההצמדה.")}
              disabled={busy}
              aria-label={section.pinnedAt ? "בטל הצמדה" : "הצמד מדור"}
              title={section.pinnedAt ? "בטל הצמדה" : "הצמד מדור"}
              className="focus-ring glass-control-hover grid size-8 place-items-center rounded-lg text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              {section.pinnedAt ? <PinOff size={14} aria-hidden /> : <Pin size={14} aria-hidden />}
            </button>
            <button
              onClick={() => setConfirmingDelete(true)}
              aria-label="מחק מדור"
              title="מחק מדור"
              className={cn(
                "focus-ring grid size-8 place-items-center rounded-lg text-muted transition-colors",
                "hover:bg-red-500/12 hover:text-red-500"
              )}
            >
              <Trash2 size={14} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {confirmingDelete && (
        <div
          role="alertdialog"
          aria-label="אישור מחיקת מדור"
          className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3.5"
        >
          <div>
            <p className="text-sm font-medium text-foreground">למחוק את המדור “{section.name}”?</p>
            <p className="mt-1 text-xs text-muted">
              {itemCount > 0
                ? `${itemCount} פריטים שמתויקים כאן לא יימחקו — הם יחזרו להיות ללא שיוך ותוכל לתייק אותם מחדש.`
                : "המדור ריק, אז לא ייעלם שום תוכן."}
            </p>
          </div>
          {error && (
            <p role="alert" className="text-xs text-red-500">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="focus-ring glass-control-hover rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              onClick={() => run(onDelete, "לא הצלחנו למחוק את המדור.")}
              disabled={busy}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-500 transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <Trash2 size={12} aria-hidden />
              )}
              מחק מדור
            </button>
          </div>
        </div>
      )}

      {error && !confirmingDelete && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
