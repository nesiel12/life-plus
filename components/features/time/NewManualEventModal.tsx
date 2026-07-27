"use client";

import { useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useApiCall } from "@/hooks/useApiCall";
import { cn } from "@/lib/utils";
import { LIFE_AREA_LIST } from "@/lib/lifeAreas";
import type { MomentCategory, Person } from "@/types";

interface NewManualEventModalProps {
  open: boolean;
  onClose: () => void;
  people: Person[];
  onCreate: (event: {
    title: string;
    startTime: string;
    endTime: string;
    category?: MomentCategory;
    reminderMinutes?: number;
    linkedContactIds?: string[];
  }) => Promise<void>;
}

const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "ללא תזכורת" },
  { value: "15", label: "15 דקות לפני" },
  { value: "30", label: "30 דקות לפני" },
  { value: "60", label: "שעה לפני" },
  { value: "1440", label: "יום לפני" },
];

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

function defaultEnd(): string {
  return toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000));
}

// The Time & Calendar Space's "New Event" flow — same fixed-header/
// scrolling-content/fixed-footer modal shape as NewTaskModal/
// NewTransactionModal. Contacts are a toggle-chip multi-select over the
// real people already in the store (no search/pagination — the same
// scale assumption the rest of the app makes for a single-user list),
// and category reuses the app's own life-area vocabulary (LIFE_AREA_LIST)
// rather than a new taxonomy, so an event tagged "family" means the same
// thing a moment or task tagged "family" does.
export function NewManualEventModal({ open, onClose, people, onCreate }: NewManualEventModalProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(defaultStart());
  const [endTime, setEndTime] = useState(defaultEnd());
  const [category, setCategory] = useState<MomentCategory | "">("");
  const [reminderMinutes, setReminderMinutes] = useState("");
  const [linkedContactIds, setLinkedContactIds] = useState<string[]>([]);

  const { loading: creating, error: createError, run: create } = useApiCall(async () => {
    await onCreate({
      title: title.trim(),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      category: category || undefined,
      reminderMinutes: reminderMinutes ? Number(reminderMinutes) : undefined,
      linkedContactIds,
    });
    resetAndClose();
  });

  function resetAndClose() {
    setTitle("");
    setStartTime(defaultStart());
    setEndTime(defaultEnd());
    setCategory("");
    setReminderMinutes("");
    setLinkedContactIds([]);
    onClose();
  }

  function toggleContact(personId: string) {
    setLinkedContactIds((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    );
  }

  const canSave = title.trim().length > 0 && new Date(endTime).getTime() > new Date(startTime).getTime();

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
      panelClassName="flex max-h-[85vh] w-full max-w-2xl flex-col p-0"
    >
      <div className="flex items-center justify-between p-6 pb-4">
        <p className="text-sm font-medium text-foreground">אירוע חדש</p>
        <button
          onClick={resetAndClose}
          disabled={creating}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-white/5 hover:text-foreground disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6">
        <div className="flex flex-col gap-3 pb-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="new-event-title" className="text-xs text-muted">
              כותרת
            </label>
            <input
              id="new-event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="למשל: פגישה עם הרופא"
              autoFocus
              className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-event-start" className="text-xs text-muted">
                התחלה
              </label>
              <input
                id="new-event-start"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-event-end" className="text-xs text-muted">
                סיום
              </label>
              <input
                id="new-event-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="focus-ring ltr rounded-lg bg-white/5 px-3 py-2 text-start text-sm text-foreground"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-event-category" className="text-xs text-muted">
                קטגוריה
              </label>
              <select
                id="new-event-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as MomentCategory | "")}
                className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
              >
                <option value="">כללי</option>
                {LIFE_AREA_LIST.map((area) => (
                  <option key={area.key} value={area.key}>
                    {area.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="new-event-reminder" className="text-xs text-muted">
                <Bell size={11} className="ms-1 inline" aria-hidden />
                תזכורת
              </label>
              <select
                id="new-event-reminder"
                value={reminderMinutes}
                onChange={(e) => setReminderMinutes(e.target.value)}
                className="focus-ring rounded-lg bg-white/5 px-3 py-2 text-sm text-foreground"
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {people.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted">שייך אנשי קשר (לא חובה)</label>
              <div className="flex flex-wrap gap-1.5">
                {people.map((person) => {
                  const isSelected = linkedContactIds.includes(person.id);
                  const displayName = person.hebrewName ?? person.name;
                  return (
                    <button
                      key={person.id}
                      type="button"
                      onClick={() => toggleContact(person.id)}
                      aria-pressed={isSelected}
                      className={cn(
                        "focus-ring flex items-center gap-1.5 rounded-full py-1 ps-1 pe-2.5 text-xs transition-colors",
                        isSelected ? "bg-accent-finance/20 text-accent-finance" : "bg-white/5 text-muted hover:text-foreground"
                      )}
                    >
                      <PersonAvatar person={person} size={18} />
                      {displayName}
                      {isSelected && <Check size={11} aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {createError && <p className="text-xs text-accent-family">{createError}</p>}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-glass-border p-6 pt-4">
        <button
          onClick={handleCreate}
          disabled={!canSave || creating}
          className="focus-ring rounded-lg bg-accent-time/20 px-4 py-2 text-sm font-medium text-accent-time transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {creating ? "יוצר…" : "צור אירוע"}
        </button>
      </div>
    </Modal>
  );
}
