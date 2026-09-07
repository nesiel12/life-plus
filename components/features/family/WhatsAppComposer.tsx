"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, MessageCircle, Pencil, RotateCcw, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { ROLE_LABELS, buildMessage, whatsappLink } from "@/lib/family/whatsapp";
import { cn } from "@/lib/utils";
import type { Person, PersonGender, PersonRole } from "@/types";

const ROLES: PersonRole[] = ["mother", "father", "grandfather", "grandmother", "friend", "other"];

interface WhatsAppComposerProps {
  person: Person;
  displayName: string;
}

// The Family & Friends messaging station (LifeOS Pillar 4).
//
// Human-in-the-loop by construction: this composes text and hands the user a
// wa.me link. There is no send path here at all — WhatsApp opens with the
// message pre-loaded in the compose box and the person presses send. Nothing
// leaves the device without a human doing it.
//
// The WhatsApp button is now the link itself. It used to be a disclosure
// toggle: tap "הודעת WhatsApp" → a panel expands → tap "פתח ב-WhatsApp" —
// three interactions and two decisions to send a message that was already
// written and saved. The settings behind that panel (who they are, what the
// message says) are things you set once and change rarely, so they belong
// behind the pencil, not in front of the send.
//
// Gender and role are saved on the contact as the user sets them, so the next
// message is already right without re-picking. Saves are optimistic (the
// store handles rollback).
export function WhatsAppComposer({ person, displayName }: WhatsAppComposerProps) {
  const updatePerson = useAtlasStore((s) => s.updatePerson);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.messageTemplate ?? "");
  const [justSaved, setJustSaved] = useState(false);

  const role = person.role ?? "other";
  const message = useMemo(
    () => buildMessage({ role, gender: person.gender, name: displayName, customTemplate: person.messageTemplate }),
    [role, person.gender, person.messageTemplate, displayName]
  );
  const link = useMemo(() => whatsappLink(person.phone, message), [person.phone, message]);

  // The preview inside the editor reflects the *draft*, not what is saved —
  // otherwise you are editing one thing and previewing another.
  const draftMessage = useMemo(
    () =>
      buildMessage({
        role,
        gender: person.gender,
        name: displayName,
        customTemplate: draft.trim() || undefined,
      }),
    [role, person.gender, displayName, draft]
  );

  // Re-open the editor on the values actually persisted, and pick up a change
  // made elsewhere (the contact modal) while it was closed.
  useEffect(() => {
    if (!editing) setDraft(person.messageTemplate ?? "");
  }, [editing, person.messageTemplate]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  function patch(update: Partial<Person>) {
    updatePerson(person.id, update).catch(() => {
      // The store rolls back on failure; the row keeps rendering the real
      // persisted values either way.
    });
  }

  function saveTemplate() {
    patch({ messageTemplate: draft.trim() || undefined });
    setEditing(false);
    setJustSaved(true);
  }

  if (!person.phone) return null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-1.5">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title={message}
            className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
          >
            <MessageCircle size={13} aria-hidden />
            WhatsApp
          </a>
        ) : (
          <span className="rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted">
            מספר הטלפון לא תקין
          </span>
        )}

        <button
          onClick={() => setEditing((v) => !v)}
          aria-expanded={editing}
          aria-label={editing ? "סגור עריכת הודעה" : "ערוך את ההודעה השמורה"}
          title={editing ? "סגור" : "ערוך את ההודעה השמורה"}
          className="focus-ring glass-control-hover grid size-7 place-items-center rounded-lg text-muted transition-colors hover:text-foreground"
        >
          {editing ? <X size={13} aria-hidden /> : <Pencil size={13} aria-hidden />}
        </button>

        {justSaved && (
          <span role="status" className="flex items-center gap-1 text-xs text-accent-health">
            <Check size={12} aria-hidden />
            נשמר
          </span>
        )}
      </div>

      {editing && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5">
          {/* Gender — required for correct Hebrew, so it's the first control. */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">פנייה בלשון</span>
            <div className="flex gap-1" role="group" aria-label="לשון הפנייה">
              {(
                [
                  { value: "male", label: "גבר" },
                  { value: "female", label: "אישה" },
                ] as { value: PersonGender; label: string }[]
              ).map((option) => (
                <button
                  key={option.value}
                  onClick={() => patch({ gender: person.gender === option.value ? undefined : option.value })}
                  aria-pressed={person.gender === option.value}
                  className={cn(
                    "focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    person.gender === option.value
                      ? "border-gold-line bg-gold-soft text-gold-ink"
                      : "border-hairline-card text-muted hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Role — selects the default template. */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">תפקיד</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="תפקיד איש הקשר">
              {ROLES.map((option) => (
                <button
                  key={option}
                  onClick={() => patch({ role: option })}
                  aria-pressed={role === option}
                  className={cn(
                    "focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    role === option
                      ? "border-gold-line bg-gold-soft text-gold-ink"
                      : "border-hairline-card text-muted hover:text-foreground"
                  )}
                >
                  {ROLE_LABELS[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={`wa-template-${person.id}`} className="text-xs text-muted">
              ההודעה השמורה
            </label>
            <textarea
              id={`wa-template-${person.id}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              placeholder="השאר ריק כדי להשתמש בנוסח לפי התפקיד. אפשר להשתמש ב-{name} לשם."
              className="focus-ring w-full resize-none rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
            />

            {/* What WhatsApp will actually open with, given the current draft. */}
            <div className="rounded-lg bg-surface px-3 py-2">
              <p className="mb-1 text-[0.65rem] uppercase tracking-wide text-muted">תצוגה מקדימה</p>
              <p className="whitespace-pre-wrap text-sm text-foreground">{draftMessage}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveTemplate}
              className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)]"
            >
              <Check size={12} aria-hidden />
              שמור
            </button>
            <button
              onClick={() => {
                setDraft(person.messageTemplate ?? "");
                setEditing(false);
              }}
              className="focus-ring rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted hover:text-foreground"
            >
              ביטול
            </button>
            {draft.trim() && (
              <button
                onClick={() => setDraft("")}
                title="חזור לנוסח ברירת המחדל לפי התפקיד"
                className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
              >
                <RotateCcw size={12} aria-hidden />
                נוסח ברירת מחדל
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
