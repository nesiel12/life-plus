"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trash2, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import type { Rabbi } from "@/types";

interface RabbiDraft {
  name: string;
  title: string;
  notes: string;
}

function draftFor(rabbi: Rabbi): RabbiDraft {
  return { name: rabbi.name, title: rabbi.title ?? "", notes: rabbi.notes ?? "" };
}

interface EditRabbiModalProps {
  rabbi: Rabbi | null;
  onClose: () => void;
  onSave: (id: string, patch: Omit<Rabbi, "id">) => void;
  onDelete: (id: string) => void;
}

export function EditRabbiModal({ rabbi, onClose, onSave, onDelete }: EditRabbiModalProps) {
  const [draft, setDraft] = useState<RabbiDraft | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft(rabbi ? draftFor(rabbi) : null);
    setConfirmingDelete(false);
  }, [rabbi]);

  if (!rabbi || !draft) return null;
  const currentRabbi = rabbi;

  function updateDraft(patch: Partial<RabbiDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handleSave() {
    if (!draft || !draft.name.trim()) return;
    onSave(currentRabbi.id, {
      name: draft.name.trim(),
      title: draft.title.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    });
    onClose();
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    onDelete(currentRabbi.id);
    onClose();
  }

  return (
    <Modal
      open={Boolean(rabbi)}
      onClose={onClose}
      closeOnBackdropClick
      closeOnEscape
      zIndex={Z_INDEX.modal}
      panelClassName="max-w-md flex flex-col gap-4 p-6"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">עריכת רב</p>
        <button
          onClick={onClose}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-fill-subtle hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <input
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="שם הרב"
          aria-label="שם הרב"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <input
          value={draft.title}
          onChange={(e) => updateDraft({ title: e.target.value })}
          placeholder="תפקיד / קהילה, למשל: ראש ישיבה"
          aria-label="תפקיד או קהילה"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <textarea
          value={draft.notes}
          onChange={(e) => updateDraft({ notes: e.target.value })}
          placeholder="הערות"
          aria-label="הערות על הרב"
          rows={3}
          className="focus-ring resize-none rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
      </div>

      <div className="flex items-center justify-between">
        {confirmingDelete ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-xs">
            <span className="text-muted">למחוק לתמיד?</span>
            <button
              onClick={handleDelete}
              className="focus-ring rounded-lg bg-accent-family/20 px-2.5 py-1 font-medium text-accent-family transition-opacity hover:opacity-80"
            >
              כן, מחק
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              className="focus-ring text-muted transition-colors hover:text-foreground"
            >
              ביטול
            </button>
          </motion.div>
        ) : (
          <button
            onClick={handleDelete}
            className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-accent-family"
          >
            <Trash2 size={13} aria-hidden />
            מחק רב
          </button>
        )}

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!draft.name.trim()}
          className="focus-ring rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-colors hover:bg-accent-faith/30 disabled:opacity-40"
        >
          שמור
        </motion.button>
      </div>
    </Modal>
  );
}
