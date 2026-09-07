"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";

/** The minimum an event has to expose to be deletable from a view. */
export interface DeletableEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  /** Which Google calendar it lives on. Defaults to primary when absent. */
  calendarId?: string;
  /** Subscribed/shared calendars are read-only — no delete affordance. */
  canEdit?: boolean;
}

function formatWhen(event: DeletableEvent): string {
  // An all-day event's start is a bare "YYYY-MM-DD"; parsing that as a Date
  // and formatting a time would invent an hour that isn't real.
  const isAllDay = !event.start.includes("T");
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return "";

  const date = start.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (isAllDay) return `${date} · כל היום`;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return event.end ? `${date} · ${time(event.start)}–${time(event.end)}` : `${date} · ${time(event.start)}`;
}

/**
 * Deleting from the calendar, with the app's standing rule that no
 * irreversible action happens without an explicit, separate confirmation
 * (docs/ATLAS_BIBLE.md rule 4). The trash icon only ever *proposes*; this
 * dialog is what actually calls Google.
 *
 * The same confirm-then-mutate shape the AI command panel already uses for
 * "clear my evening" (components/features/CommandPanel.tsx), reused here so
 * one-off deletes and bulk deletes behave identically.
 */
export function useEventDeletion(onDeleted?: (event: DeletableEvent) => void) {
  const [pending, setPending] = useState<DeletableEvent | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback((event: DeletableEvent) => {
    setError(null);
    setPending(event);
  }, []);

  const cancel = useCallback(() => {
    if (deleting) return; // a request is already in flight with Google
    setPending(null);
    setError(null);
  }, [deleting]);

  const confirm = useCallback(async () => {
    if (!pending) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          googleEventId: pending.id,
          calendarId: pending.calendarId ?? "primary",
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "לא הצלחנו למחוק את האירוע. נסה שוב.");
        return;
      }

      onDeleted?.(pending);
      setPending(null);
    } catch {
      setError("אין חיבור לשרת. בדוק את החיבור ונסה שוב.");
    } finally {
      setDeleting(false);
    }
  }, [pending, onDeleted]);

  return { pending, deleting, error, request, cancel, confirm };
}

interface DeleteEventDialogProps {
  event: DeletableEvent | null;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteEventDialog({
  event,
  deleting,
  error,
  onCancel,
  onConfirm,
}: DeleteEventDialogProps) {
  return (
    <Modal
      open={event !== null}
      onClose={onCancel}
      closeOnBackdropClick={!deleting}
      closeOnEscape={!deleting}
      panelClassName="max-w-md p-6"
    >
      {event && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-red-500/12 text-red-500">
              <AlertTriangle size={17} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-medium text-foreground">למחוק את האירוע?</h2>
              <p className="mt-1 text-sm text-muted">
                האירוע יימחק מיומן Google שלך. אי אפשר לבטל את הפעולה מכאן.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-hairline-card bg-surface-sunken/60 p-3">
            <p className="truncate text-sm font-medium text-foreground">{event.title}</p>
            <p className="mt-0.5 text-xs text-muted">{formatWhen(event)}</p>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={deleting}
              className="focus-ring glass-control-hover rounded-lg px-4 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className={cn(
                "focus-ring flex items-center gap-2 rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-500",
                "transition-opacity hover:opacity-80 disabled:opacity-50"
              )}
            >
              {deleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  מוחק…
                </>
              ) : (
                <>
                  <Trash2 size={14} aria-hidden />
                  מחק אירוע
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

interface DeleteEventButtonProps {
  event: DeletableEvent;
  onRequest: (event: DeletableEvent) => void;
  /** Compact variant for the dense week grid. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * The trash affordance itself. Hidden for calendars the user only has read
 * access to — offering a delete that Google will refuse is worse than not
 * offering one.
 */
export function DeleteEventButton({
  event,
  onRequest,
  size = "md",
  className,
}: DeleteEventButtonProps) {
  if (event.canEdit === false) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Views nest these inside clickable day cells and event cards; a
        // delete must never also trigger the container's navigation.
        e.stopPropagation();
        e.preventDefault();
        onRequest(event);
      }}
      aria-label={`מחק את האירוע ${event.title}`}
      title="מחק אירוע"
      className={cn(
        "focus-ring grid shrink-0 place-items-center rounded-md text-muted transition-colors",
        "hover:bg-red-500/12 hover:text-red-500",
        // Always reachable by keyboard and always visible on touch, where
        // there is no hover to reveal it.
        "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
        size === "sm" ? "size-5" : "size-7",
        className
      )}
    >
      <Trash2 size={size === "sm" ? 11 : 14} aria-hidden />
    </button>
  );
}
