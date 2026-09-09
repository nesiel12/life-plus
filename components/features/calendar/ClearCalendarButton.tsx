"use client";

import { useState } from "react";
import { AlertTriangle, Check, Eraser, Loader2 } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

type Scope = "day" | "week" | "month" | "year";

const SCOPES: { value: Scope; label: string; hint: string }[] = [
  { value: "day", label: "ניקוי היום", hint: "כל האירועים של היום" },
  { value: "week", label: "ניקוי השבוע", hint: "מיום ראשון עד שבת" },
  { value: "month", label: "ניקוי החודש", hint: "כל אירועי החודש הנוכחי" },
  { value: "year", label: "ניקוי השנה", hint: "כל אירועי השנה הנוכחית" },
];

interface ClearResult {
  deleted: number;
  failed: number;
  remaining: number;
  scopeLabel: string;
}

interface ClearCalendarButtonProps {
  /** Any instant inside the window the user is looking at. */
  anchor: Date;
  /** Refetch the calendar after events are removed. */
  onCleared?: () => void;
}

// "ניקוי יומן" — a bulk delete of a window of the real Google Calendar.
// Deliberately behind two walls: a scope has to be chosen, then a second
// explicit confirm that names the scope and says it cannot be undone. Only
// events the grant can write to are touched (the server filters to canEdit),
// so a subscribed feed is never half-cleared.
export function ClearCalendarButton({ anchor, onCleared }: ClearCalendarButtonProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope | null>(null);
  const [phase, setPhase] = useState<"pick" | "confirm" | "working" | "done">("pick");
  const [result, setResult] = useState<ClearResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setScope(null);
    setPhase("pick");
    setResult(null);
    setError(null);
  }

  function close() {
    setOpen(false);
    // Let the modal finish animating out before the content resets.
    setTimeout(reset, 200);
  }

  async function clear() {
    if (!scope) return;
    setPhase("working");
    setError(null);
    try {
      const res = await fetch("/api/calendar/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, anchor: anchor.toISOString() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(typeof data?.error === "string" ? data.error : "הניקוי נכשל.");
        setPhase("confirm");
        return;
      }
      setResult(data as ClearResult);
      setPhase("done");
      onCleared?.();
    } catch {
      setError("אין חיבור לשרת.");
      setPhase("confirm");
    }
  }

  const activeScope = SCOPES.find((s) => s.value === scope);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent-family/40 hover:text-accent-family"
      >
        <Eraser size={12} aria-hidden />
        ניקוי יומן
      </button>

      <Modal open={open} onClose={close} zIndex={Z_INDEX.modal} panelClassName="max-w-md p-5">
        <div className="mb-4 flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-family/12 text-accent-family">
            <Eraser size={18} aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-medium text-foreground">ניקוי יומן</h2>
            <p className="mt-0.5 text-xs text-muted">
              מוחק אירועים מיומן Google האמיתי שלך. אירועים מיומנים משותפים שאין לך בהם הרשאת עריכה
              יישארו.
            </p>
          </div>
        </div>

        {phase === "done" && result ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 rounded-xl border border-accent-health/30 bg-accent-health/10 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-accent-health">
                <Check size={14} aria-hidden />
                {result.deleted > 0
                  ? `נמחקו ${result.deleted} אירועים (${result.scopeLabel}).`
                  : `לא נמצאו אירועים למחיקה ${result.scopeLabel}.`}
              </p>
              {result.failed > 0 && (
                <p className="text-xs text-muted">{result.failed} אירועים לא נמחקו — נסה שוב.</p>
              )}
              {result.remaining > 0 && (
                <p className="text-xs text-muted">
                  נותרו עוד {result.remaining} — הרץ שוב כדי להשלים.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {result.remaining > 0 ? (
                <button
                  onClick={() => setPhase("confirm")}
                  className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-medium text-[var(--background)]"
                >
                  המשך ניקוי
                </button>
              ) : (
                <button
                  onClick={close}
                  className="focus-ring rounded-lg bg-ink px-4 py-2 text-sm font-medium text-[var(--background)]"
                >
                  סגור
                </button>
              )}
            </div>
          </div>
        ) : phase === "confirm" || phase === "working" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-xl border border-accent-family/30 bg-accent-family/10 p-3">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-accent-family" aria-hidden />
              <p className="text-sm text-foreground">
                למחוק את <span className="font-medium">כל האירועים {activeScope?.label.replace("ניקוי ", "")}</span>{" "}
                מיומן Google? הפעולה אינה הפיכה.
              </p>
            </div>
            {error && <p className="text-xs text-accent-family">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase("pick")}
                disabled={phase === "working"}
                className="focus-ring rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
              >
                חזרה
              </button>
              <button
                onClick={clear}
                disabled={phase === "working"}
                className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-family/20 px-4 py-2 text-sm font-medium text-accent-family transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                {phase === "working" ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  <Eraser size={13} aria-hidden />
                )}
                {phase === "working" ? "מוחק…" : "מחק לצמיתות"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {SCOPES.map((s) => (
              <button
                key={s.value}
                onClick={() => {
                  setScope(s.value);
                  setPhase("confirm");
                }}
                className={cn(
                  "focus-ring flex items-center justify-between rounded-xl border border-hairline-card px-3.5 py-2.5 text-start transition-colors hover:border-accent-family/40 hover:bg-fill-subtle"
                )}
              >
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className="text-xs text-muted">{s.hint}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
