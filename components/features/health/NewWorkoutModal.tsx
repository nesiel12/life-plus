"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";

interface NewWorkoutModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (workout: {
    title: string;
    startTime?: string;
    endTime?: string;
    routineDetails?: string;
  }) => Promise<void>;
}

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultStart(): string {
  return toDateTimeLocalValue(new Date());
}

// Health & Fitness Space (Phase 8)'s "Log a workout" flow. endTime is
// optional in the input (a blank field means "still going" or "didn't
// track the exact end") — mirrors workouts.end_time's own nullable column,
// not forcing a fabricated end time just to satisfy the form.
export function NewWorkoutModal({ open, onClose, onCreate }: NewWorkoutModalProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(defaultStart());
  const [endTime, setEndTime] = useState("");
  const [routineDetails, setRoutineDetails] = useState("");

  const { loading: creating, error: createError, run: create } = useApiCall(async () => {
    await onCreate({
      title: title.trim(),
      startTime: new Date(startTime).toISOString(),
      endTime: endTime ? new Date(endTime).toISOString() : undefined,
      routineDetails: routineDetails.trim() || undefined,
    });
    resetAndClose();
  });

  function resetAndClose() {
    setTitle("");
    setStartTime(defaultStart());
    setEndTime("");
    setRoutineDetails("");
    onClose();
  }

  const canSave =
    title.trim().length > 0 && (!endTime || new Date(endTime).getTime() > new Date(startTime).getTime());

  function handleCreate() {
    if (!canSave || creating) return;
    create().catch(() => {
      // error is already captured in createError for display below
    });
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      closeOnBackdropClick={!creating}
      closeOnEscape={!creating}
      zIndex={Z_INDEX.modal}
      panelClassName="flex max-h-[85vh] w-full max-w-lg flex-col p-0"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <p className="text-sm font-medium text-foreground">אימון חדש</p>
        <button
          onClick={resetAndClose}
          disabled={creating}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-fill-subtle hover:text-foreground disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-workout-title" className="text-xs text-muted">
              סוג האימון
            </label>
            <input
              id="new-workout-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: אימון כוח — פלג גוף עליון"
              autoFocus
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-workout-start" className="text-xs text-muted">
                התחלה
              </label>
              <input
                id="new-workout-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-workout-end" className="text-xs text-muted">
                סיום (לא חובה)
              </label>
              <input
                id="new-workout-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="new-workout-details" className="text-xs text-muted">
              פרטי השגרה (לא חובה)
            </label>
            <textarea
              id="new-workout-details"
              value={routineDetails}
              onChange={(e) => setRoutineDetails(e.target.value)}
              placeholder="למשל: 4 סטים של סקוואט, 3 סטים של לחיצת חזה…"
              rows={3}
              className="focus-ring resize-none rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          {createError && <p className="text-xs text-accent-family">{createError}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-glass-border p-6 pt-4">
        <button
          onClick={handleCreate}
          disabled={!canSave || creating}
          className="focus-ring rounded-lg bg-accent-fitness/20 px-4 py-2 text-sm font-medium text-accent-fitness transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {creating ? "שומר…" : "שמור אימון"}
        </button>
      </div>
    </Modal>
  );
}
