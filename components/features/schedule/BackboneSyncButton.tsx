"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarCheck, Check, Loader2 } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  BACKBONE_SCOPE_LABELS,
  countBackboneOccurrences,
  type BackboneScope,
} from "@/lib/calendar/backboneSync";
import { cn } from "@/lib/utils";

const SCOPES: BackboneScope[] = ["1d", "2d", "1m", "1y", "single"];

// Exports the weekly skeleton into the real Google Calendar. The in-app
// skeleton is still the default; this is for people who'd rather have one
// calendar. Creates recurring events (one per block) for the range scopes, or
// a single concrete occurrence per block for "single".
export function BackboneSyncButton() {
  const blocks = useAtlasStore((s) => s.routineBlocks);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<BackboneScope>("1m");
  const [state, setState] = useState<"idle" | "confirm" | "syncing" | "done">("idle");
  const [result, setResult] = useState<{ created: number; failures: string[]; skipped: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const approxCount = useMemo(() => countBackboneOccurrences(blocks, scope), [blocks, scope]);

  async function sync() {
    setState("syncing");
    setError(null);
    try {
      const res = await fetch("/api/calendar/sync-backbone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "הסנכרון נכשל.");
        setState("confirm");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("אין חיבור לשרת.");
      setState("confirm");
    }
  }

  if (blocks.length === 0) return null;

  return (
    <div className="rounded-xl border border-hairline-card bg-surface-sunken/40 p-3">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center justify-between gap-2 text-start"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <CalendarCheck size={15} className="text-accent-career" aria-hidden />
          סנכרון ליומן Google
        </span>
        <span className="text-xs text-muted">{open ? "סגור" : "פתח"}</span>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-xs text-muted">
            מייצא את בלוקי השלד ליומן Google האמיתי שלך. ברירת המחדל נשארת השלד באפליקציה — זה למי
            שמעדיף לנהל יומן אחד.
          </p>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="לכמה זמן להחיל">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setScope(s);
                  setState("idle");
                  setResult(null);
                }}
                aria-pressed={scope === s}
                className={cn(
                  "focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors",
                  scope === s
                    ? "border-gold-line bg-gold-soft font-medium text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {BACKBONE_SCOPE_LABELS[s]}
              </button>
            ))}
          </div>

          {state === "done" && result ? (
            <div className="flex flex-col gap-1 rounded-lg border border-accent-health/30 bg-accent-health/10 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-medium text-accent-health">
                <Check size={13} aria-hidden />
                {scope === "single"
                  ? `נוצרו ${result.created} אירועים ביומן Google.`
                  : `נוצרו ${result.created} אירועים חוזרים ביומן Google.`}
              </p>
              {result.failures.length > 0 && (
                <p className="text-muted">לא נוצרו: {result.failures.join(", ")}</p>
              )}
              {result.skipped.length > 0 && (
                <p className="text-muted">מחוץ לטווח: {result.skipped.join(", ")}</p>
              )}
            </div>
          ) : state === "confirm" || state === "syncing" ? (
            <div className="flex flex-col gap-2 rounded-lg border border-gold-line bg-gold-soft/40 p-3">
              <p className="flex items-start gap-1.5 text-xs text-foreground">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-gold-ink" aria-hidden />
                ייווצרו {scope === "single" ? `${blocks.filter((b) => b.isActive).length} אירועים` : `אירועים חוזרים (כ-${approxCount} מופעים)`} ביומן Google. אפשר למחוק אותם משם בכל עת.
              </p>
              {error && <p className="text-xs text-accent-family">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={sync}
                  disabled={state === "syncing"}
                  className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-50"
                >
                  {state === "syncing" ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <CalendarCheck size={12} aria-hidden />}
                  {state === "syncing" ? "מסנכרן…" : "אשר וסנכרן"}
                </button>
                <button
                  onClick={() => setState("idle")}
                  disabled={state === "syncing"}
                  className="focus-ring rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setState("confirm")}
              className="focus-ring flex w-fit items-center gap-1.5 rounded-lg bg-accent-career/20 px-3 py-1.5 text-xs font-medium text-accent-career transition-opacity hover:opacity-80"
            >
              <CalendarCheck size={13} aria-hidden />
              סנכרן {BACKBONE_SCOPE_LABELS[scope]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
