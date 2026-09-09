"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { useApiCall } from "@/hooks/useApiCall";
import type { MealType } from "@/types";

interface NewMealModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (meal: {
    description: string;
    type: MealType;
    eatenAt?: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fats?: number;
  }) => Promise<void>;
}

const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "ארוחת בוקר" },
  { value: "lunch", label: "ארוחת צהריים" },
  { value: "dinner", label: "ארוחת ערב" },
  { value: "snack", label: "חטיף" },
  { value: "post-workout", label: "לאחר אימון" },
];

function toDateTimeLocalValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function defaultEatenAt(): string {
  return toDateTimeLocalValue(new Date());
}

// Health & Fitness Space (Phase 8)'s "Log a meal" flow — same fixed-header/
// scrolling-content/fixed-footer modal shape as NewManualEventModal.
export function NewMealModal({ open, onClose, onCreate }: NewMealModalProps) {
  const [description, setDescription] = useState("");
  const [type, setType] = useState<MealType>("lunch");
  const [eatenAt, setEatenAt] = useState(defaultEatenAt());

  const { loading: creating, error: createError, run: create } = useApiCall(async () => {
    await onCreate({
      description: description.trim(),
      type,
      eatenAt: new Date(eatenAt).toISOString(),
    });
    resetAndClose();
  });

  function resetAndClose() {
    setDescription("");
    setType("lunch");
    setEatenAt(defaultEatenAt());
    onClose();
  }

  const canSave = description.trim().length > 0;

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
        <p className="text-sm font-medium text-foreground">ארוחה חדשה</p>
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
            <label htmlFor="new-meal-description" className="text-xs text-muted">
              מה אכלת?
            </label>
            <input
              id="new-meal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="למשל: חזה עוף עם אורז וירקות"
              autoFocus
              className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-meal-type" className="text-xs text-muted">
                סוג ארוחה
              </label>
              <select
                id="new-meal-type"
                value={type}
                onChange={(e) => setType(e.target.value as MealType)}
                className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground"
              >
                {MEAL_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-meal-eaten-at" className="text-xs text-muted">
                מתי
              </label>
              <input
                id="new-meal-eaten-at"
                type="datetime-local"
                value={eatenAt}
                onChange={(e) => setEatenAt(e.target.value)}
                className="focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
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
          {creating ? "שומר…" : "שמור ארוחה"}
        </button>
      </div>
    </Modal>
  );
}
