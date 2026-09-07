"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, FileUp, Loader2, Sparkles, Upload, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  ROUTINE_KIND_LABELS,
  WEEKDAY_INITIALS,
  formatMinute,
  type RoutineKind,
} from "@/lib/schedule/routine";
import { cn } from "@/lib/utils";

interface ProposedBlock {
  title: string;
  kind: RoutineKind;
  weekdays: number[];
  startMinute: number;
  endMinute: number;
  note?: string;
}

interface ImportResponse {
  blocks: ProposedBlock[];
  warnings: string[];
  overlaps: string[];
}

const ACCEPT = "image/*,.pdf,.docx,.txt,.csv,.md";

/**
 * Importing a timetable someone already has.
 *
 * Photograph it, upload it, or paste it — the model reads it and proposes
 * blocks. Nothing is written until the user has looked at the proposal and
 * confirmed it, and anything the model could not read is shown rather than
 * quietly dropped, because a silently missing lesson is a hole in someone's
 * week they have no way to notice.
 */
export function ScheduleImportPanel() {
  const importBlocks = useAtlasStore((s) => s.importRoutineBlocks);
  const existingCount = useAtlasStore((s) => s.routineBlocks.length);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ImportResponse | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [replace, setReplace] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setFileName(null);
    setProposal(null);
    setSelected(new Set());
    setError(null);
    setReplace(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function analyze() {
    const file = fileRef.current?.files?.[0];
    if (!text.trim() && !file) {
      setError("הדבק את המערכת, או בחר קובץ או תמונה.");
      return;
    }

    setLoading(true);
    setError(null);
    setProposal(null);

    try {
      const form = new FormData();
      if (text.trim()) form.set("text", text.trim());
      if (file) form.set("file", file);

      const res = await fetch("/api/ai/schedule-import", { method: "POST", body: form });
      const data = (await res.json()) as ImportResponse & { error?: string };

      if (!res.ok) {
        setError(data.error ?? "לא הצלחנו לקרוא את המערכת.");
        return;
      }
      if (data.blocks.length === 0) {
        setError(
          data.warnings[0] ?? "לא זיהינו מערכת שעות. נסה תמונה ברורה יותר, או הדבק את הטקסט."
        );
        return;
      }

      setProposal(data);
      // Everything selected by default: the user is confirming a reading, not
      // assembling a timetable from scratch.
      setSelected(new Set(data.blocks.map((_, i) => i)));
    } catch {
      setError("אין חיבור לשרת. בדוק את החיבור ונסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!proposal) return;
    const chosen = proposal.blocks.filter((_, i) => selected.has(i));
    if (chosen.length === 0) {
      setError("לא נבחר אף בלוק.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await importBlocks(chosen, { replace });
      setOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "לא הצלחנו לשמור את הבלוקים.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="focus-ring glass-control flex w-fit items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium text-foreground"
      >
        <Sparkles size={13} className="text-gold-ink" aria-hidden />
        ייבוא מערכת שעות
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles size={14} className="text-gold-ink" aria-hidden />
          ייבוא מערכת שעות
        </p>
        <button
          onClick={() => {
            setOpen(false);
            reset();
          }}
          aria-label="סגור"
          className="focus-ring grid size-7 place-items-center rounded-lg text-muted hover:text-foreground"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      {!proposal ? (
        <>
          <p className="text-xs text-muted">
            צלם את המערכת, העלה קובץ, או הדבק אותה כטקסט. נציג לך מה זוהה לפני ששומרים.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"למשל:\nראשון 08:00-12:00 ישיבה\nראשון 14:00-16:00 עבודה\nשלישי 18:00-19:00 אימון"}
            aria-label="מערכת שעות כטקסט"
            className="focus-ring w-full resize-y rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
              className="sr-only"
              id="schedule-import-file"
            />
            <label
              htmlFor="schedule-import-file"
              className="focus-ring glass-control flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-foreground"
            >
              <Upload size={13} aria-hidden />
              תמונה או קובץ
            </label>
            {fileName && (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <FileUp size={12} aria-hidden />
                <span className="max-w-[12rem] truncate">{fileName}</span>
                <button
                  onClick={() => {
                    setFileName(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                  aria-label="הסר קובץ"
                  className="focus-ring rounded p-0.5 hover:text-foreground"
                >
                  <X size={11} aria-hidden />
                </button>
              </span>
            )}
          </div>

          {error && (
            <p role="alert" className="text-xs text-red-500">
              {error}
            </p>
          )}

          <button
            onClick={analyze}
            disabled={loading}
            className="focus-ring flex w-fit items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" aria-hidden />
                קורא את המערכת…
              </>
            ) : (
              <>
                <Sparkles size={13} aria-hidden />
                נתח
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            זיהינו {proposal.blocks.length} בלוקים. בטל סימון של מה שלא נכון, ואז אשר.
          </p>

          {(proposal.warnings.length > 0 || proposal.overlaps.length > 0) && (
            <div className="flex flex-col gap-1.5 rounded-lg border border-gold-line/50 bg-gold-soft/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-gold-ink">
                <AlertTriangle size={12} aria-hidden />
                שים לב
              </p>
              <ul className="flex list-disc flex-col gap-1 pe-4 text-xs text-foreground/80">
                {proposal.warnings.map((warning, i) => (
                  <li key={`w-${i}`}>{warning}</li>
                ))}
                {proposal.overlaps.map((overlap, i) => (
                  <li key={`o-${i}`}>{overlap}</li>
                ))}
              </ul>
            </div>
          )}

          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {proposal.blocks.map((block, i) => {
              const on = selected.has(i);
              return (
                <li key={i}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition-colors",
                      on ? "border-gold-line bg-surface" : "border-hairline-card opacity-55"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(selected);
                        if (on) next.delete(i);
                        else next.add(i);
                        setSelected(next);
                      }}
                      className="focus-ring mt-0.5 size-4 shrink-0 accent-[var(--gold)]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{block.title}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="ltr inline-block tabular-nums">
                          {formatMinute(block.startMinute)}–{formatMinute(block.endMinute)}
                        </span>
                        {" · "}
                        {ROUTINE_KIND_LABELS[block.kind]}
                        {" · "}
                        {block.weekdays.map((d) => WEEKDAY_INITIALS[d]).join(", ")}
                      </p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          {existingCount > 0 && (
            <label className="flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
                className="focus-ring mt-0.5 size-3.5 shrink-0 accent-[var(--gold)]"
              />
              <span>
                החלף את הלוז הקיים ({existingCount} בלוקים) במקום להוסיף.
                {replace && (
                  <strong className="block text-red-500">
                    כל הבלוקים הקיימים יימחקו, כולל כאלה שערכת ידנית.
                  </strong>
                )}
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="text-xs text-red-500">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              onClick={confirm}
              disabled={saving || selected.size === 0}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-xs font-medium text-[var(--background)] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={13} className="animate-spin" aria-hidden />
              ) : (
                <Check size={13} aria-hidden />
              )}
              {replace ? "החלף" : "הוסף"} {selected.size} בלוקים
            </button>
            <button
              onClick={reset}
              disabled={saving}
              className="focus-ring rounded-lg border border-hairline-card px-3.5 py-2 text-xs text-muted hover:text-foreground disabled:opacity-50"
            >
              התחל מחדש
            </button>
          </div>
        </>
      )}
    </div>
  );
}
