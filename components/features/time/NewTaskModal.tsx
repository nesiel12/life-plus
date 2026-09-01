"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";

interface NewTaskModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (task: { title: string; description?: string; dueDate?: string }) => Promise<void>;
}

// The Time & Tasks Space's "New Task" flow — same fixed-header/scrolling-
// content/fixed-footer modal shape as AiSummaryModal and the Rabbi/Book
// profile modals, so the action button stays reachable above a mobile
// keyboard here too. Only title/description/due date are collected here;
// status defaults to 'todo' and is_high_priority to false server-side.
export function NewTaskModal({ open, onClose, onCreate }: NewTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(""); // datetime-local input value

  const { loading: creating, error: createError, run: create } = useApiCall(async () => {
    await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    });
    resetAndClose();
  });

  function resetAndClose() {
    setTitle("");
    setDescription("");
    setDueDate("");
    onClose();
  }

  function handleCreate() {
    if (!title.trim() || creating) return;
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
      panelClassName="flex max-h-[85vh] w-full max-w-2xl flex-col p-0"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <p className="text-sm font-medium text-foreground">משימה חדשה</p>
        <button
          onClick={resetAndClose}
          disabled={creating}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-fill-subtle hover:text-foreground disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrolls independently of the fixed header/footer, same
          mobile-friendly pattern every other modal in the app uses. */}
      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-title" className="text-xs text-muted">
              כותרת
            </label>
            <input
              id="new-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: לסיים את הדוח הרבעוני"
              autoFocus
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-description" className="text-xs text-muted">
              תיאור (לא חובה)
            </label>
            <textarea
              id="new-task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="פרטים נוספים…"
              rows={4}
              className="focus-ring resize-none rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-due" className="text-xs text-muted">
              תאריך יעד (לא חובה)
            </label>
            <input
              id="new-task-due"
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-start text-sm text-foreground"
            />
          </div>

          {createError && <p className="text-xs text-accent-family">{createError}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-glass-border p-6 pt-4">
        <button
          onClick={handleCreate}
          disabled={!title.trim() || creating}
          className="focus-ring rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {creating ? "יוצר…" : "צור משימה"}
        </button>
      </div>
    </Modal>
  );
}
