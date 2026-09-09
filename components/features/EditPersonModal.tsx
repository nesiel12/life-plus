"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Loader2, Trash2, Upload, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { useAtlasStore } from "@/store/useAtlasStore";
import { useApiCall } from "@/hooks/useApiCall";
import { resizeImageToDataUrl } from "@/lib/media/resizeImageToDataUrl";
import { MonthDayPicker } from "@/components/ui/MonthDayPicker";
import { usePhotoPicker } from "@/hooks/usePhotoPicker";
import type { Person } from "@/types";

const DATE_PATTERN = /^\d{2}-\d{2}$/;

interface PersonDraft {
  name: string;
  relation: string;
  phone: string;
  birthday: string;
  birthYear: number | null;
  anniversary: string;
  note: string;
  avatarUrl: string | undefined;
}

function draftFor(person: Person): PersonDraft {
  return {
    name: person.name,
    relation: person.relation,
    phone: person.phone ?? "",
    birthday: person.birthday ?? "",
    birthYear: person.birthYear ?? null,
    anniversary: person.anniversary ?? "",
    note: person.note ?? "",
    avatarUrl: person.avatarUrl,
  };
}

// The Family CRM's full edit surface (Family CRM upgrade) — everything the
// card's own inline quick-affordances don't cover: correcting a name or
// relation, removing a birthday/anniversary entirely (an empty field maps
// to null, not left unset), a phone number for the new call/WhatsApp
// buttons, a photo, and deleting the person outright. The card's existing
// "add a date" InlineDateField stays as the fast path when a date is
// still unset; this modal is the comprehensive one.
export function EditPersonModal({ person, onClose }: { person: Person | null; onClose: () => void }) {
  // Closing on success is the refresh: the server wrote avatar_url directly,
  // so the modal's local draft is stale by definition.
  const avatarPicker = usePhotoPicker(onClose);
  const avatarBusy =
    avatarPicker.state === "opening" ||
    avatarPicker.state === "waiting" ||
    avatarPicker.state === "importing";
  const updatePerson = useAtlasStore((s) => s.updatePerson);
  const deletePerson = useAtlasStore((s) => s.deletePerson);

  const [draft, setDraft] = useState<PersonDraft | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft(person ? draftFor(person) : null);
    setDateError(null);
    setConfirmingDelete(false);
  }, [person]);

  const { loading: saving, error: saveError, run: save } = useApiCall(updatePerson);
  const { loading: deleting, error: deleteError, run: remove } = useApiCall(deletePerson);

  if (!person || !draft) return null;
  // Rebound so the nested handlers below stay narrowed to non-null — a
  // prop reference doesn't propagate the guard above into their closures.
  const currentPerson = person;

  function updateDraft(patch: Partial<PersonDraft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleAvatarChange(file: File | undefined) {
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      updateDraft({ avatarUrl: dataUrl });
    } catch {
      // A failed image read just leaves the existing avatar/initials in
      // place — not worth a dedicated error state for a cosmetic field.
    }
  }

  function handleSave() {
    if (!draft) return;
    for (const value of [draft.birthday, draft.anniversary]) {
      if (value && !DATE_PATTERN.test(value)) {
        setDateError("תאריך צריך להיות בפורמט MM-DD, למשל 05-14.");
        return;
      }
    }
    setDateError(null);

    save(currentPerson.id, {
      name: draft.name.trim(),
      relation: draft.relation.trim(),
      phone: draft.phone.trim() || undefined,
      birthday: draft.birthday.trim() || undefined,
      birthYear: draft.birthday.trim() ? draft.birthYear ?? undefined : undefined,
      anniversary: draft.anniversary.trim() || undefined,
      note: draft.note.trim() || undefined,
      avatarUrl: draft.avatarUrl,
    })
      .then(onClose)
      .catch(() => {
        // error is already captured in saveError for display below
      });
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    remove(currentPerson.id)
      .then(onClose)
      .catch(() => {
        // error is already captured in deleteError for display below
      });
  }

  const displayName = person.hebrewName ?? person.name;

  return (
    <Modal
      open={Boolean(person)}
      onClose={onClose}
      closeOnBackdropClick
      closeOnEscape
      zIndex={Z_INDEX.modal}
      panelClassName="max-w-md flex flex-col gap-4 p-6"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">עריכת {displayName}</p>
        <button
          onClick={onClose}
          aria-label="סגור"
          className="focus-ring rounded-lg p-1.5 text-muted transition-all hover:scale-110 hover:bg-fill-subtle hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <PersonAvatar person={{ ...person, avatarUrl: draft.avatarUrl }} size={56} />
        <label className="focus-ring flex cursor-pointer items-center gap-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted transition-colors hover:bg-fill hover:text-foreground">
          <Upload size={12} aria-hidden />
          החלף תמונה
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleAvatarChange(e.target.files?.[0])}
          />
        </label>

        {/* Picking from Google Photos writes people.avatar_url server-side, so
            the modal's local draft won't reflect it — onDone closes the modal
            and the refreshed store shows the new avatar. */}
        <button
          type="button"
          onClick={() => avatarPicker.start("avatar", person.id)}
          disabled={avatarBusy}
          className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted transition-colors hover:bg-fill hover:text-foreground disabled:opacity-40"
        >
          {avatarBusy ? (
            <Loader2 size={12} className="animate-spin" aria-hidden />
          ) : (
            <ImagePlus size={12} aria-hidden />
          )}
          {avatarPicker.state === "waiting" ? "ממתין לבחירה…" : "מ-Google Photos"}
        </button>
      </div>

      {avatarPicker.needsConnect && (
        <a
          href="/api/photos/connect"
          className="focus-ring rounded-lg bg-gold-soft px-3 py-2 text-center text-xs font-medium text-gold-ink"
        >
          חבר את Google Photos
        </a>
      )}
      {avatarPicker.error && !avatarPicker.needsConnect && (
        <p role="alert" className="text-xs text-accent-family">
          {avatarPicker.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input
          value={draft.name}
          onChange={(e) => updateDraft({ name: e.target.value })}
          placeholder="שם"
          aria-label="שם"
          className="focus-ring col-span-2 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <input
          value={draft.relation}
          onChange={(e) => updateDraft({ relation: e.target.value })}
          placeholder="קרבה"
          aria-label="קרבה"
          className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
        <input
          value={draft.phone}
          onChange={(e) => updateDraft({ phone: e.target.value })}
          placeholder="טלפון"
          aria-label="מספר טלפון"
          className="focus-ring ltr rounded-lg bg-fill-subtle px-3 py-2 text-end text-sm text-foreground placeholder:text-muted"
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">יום הולדת</span>
          <MonthDayPicker
            value={draft.birthday}
            onChange={(value) => updateDraft({ birthday: value })}
            year={draft.birthYear}
            onYearChange={(year) => updateDraft({ birthYear: year })}
            idPrefix="edit-person-birthday"
            ariaLabel="יום הולדת"
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted">יום נישואין</span>
          <MonthDayPicker
            value={draft.anniversary}
            onChange={(value) => updateDraft({ anniversary: value })}
            idPrefix="edit-person-anniversary"
            ariaLabel="יום נישואין"
          />
        </div>
        <textarea
          value={draft.note}
          onChange={(e) => updateDraft({ note: e.target.value })}
          placeholder="הערה"
          aria-label="הערה"
          rows={2}
          className="focus-ring col-span-2 resize-none rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
        />
      </div>

      {(dateError || saveError || deleteError) && (
        <p className="text-xs text-accent-family">{dateError ?? saveError ?? deleteError}</p>
      )}

      <div className="flex items-center justify-between">
        {confirmingDelete ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-xs"
          >
            <span className="text-muted">למחוק לתמיד?</span>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="focus-ring rounded-lg bg-accent-family/20 px-2.5 py-1 font-medium text-accent-family transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {deleting ? "מוחק…" : "כן, מחק"}
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
            מחק איש קשר
          </button>
        )}

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleSave}
          disabled={!draft.name.trim() || !draft.relation.trim() || saving}
          className="focus-ring rounded-lg bg-accent-faith/20 px-4 py-2 text-sm text-accent-faith transition-colors hover:bg-accent-faith/30 disabled:opacity-40"
        >
          {saving ? "שומר…" : "שמור"}
        </motion.button>
      </div>
    </Modal>
  );
}
