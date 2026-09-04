"use client";

import { useMemo, useState } from "react";
import { Check, MessageCircle, Pencil, Send } from "lucide-react";
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
// Gender and role are saved on the contact as the user sets them, so the
// next message is already right without re-picking. Saves are optimistic
// (the store handles rollback), so the preview updates the instant a toggle
// is clicked rather than after a round trip.
export function WhatsAppComposer({ person, displayName }: WhatsAppComposerProps) {
  const updatePerson = useAtlasStore((s) => s.updatePerson);
  const [open, setOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(false);
  const [draft, setDraft] = useState(person.messageTemplate ?? "");

  const role = person.role ?? "other";
  const message = useMemo(
    () => buildMessage({ role, gender: person.gender, name: displayName, customTemplate: person.messageTemplate }),
    [role, person.gender, person.messageTemplate, displayName]
  );
  const link = useMemo(() => whatsappLink(person.phone, message), [person.phone, message]);

  function patch(update: Partial<Person>) {
    updatePerson(person.id, update).catch(() => {
      // The store rolls back on failure; the row keeps rendering the real
      // persisted values either way.
    });
  }

  if (!person.phone) return null;

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs text-accent-health transition-opacity hover:opacity-80"
      >
        <MessageCircle size={13} aria-hidden />
        {open ? "סגור" : "הודעת WhatsApp"}
      </button>

      {open && (
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

          {/* Role — selects the template. */}
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

          {/* Live preview of exactly what WhatsApp will receive. */}
          {editingTemplate ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                placeholder="הודעה מותאמת אישית. אפשר להשתמש ב-{name} לשם."
                aria-label="הודעה מותאמת אישית"
                className="focus-ring w-full resize-none rounded-lg border border-hairline-card bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    patch({ messageTemplate: draft.trim() || undefined });
                    setEditingTemplate(false);
                  }}
                  className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)]"
                >
                  <Check size={12} aria-hidden />
                  שמור
                </button>
                <button
                  onClick={() => {
                    setDraft(person.messageTemplate ?? "");
                    setEditingTemplate(false);
                  }}
                  className="focus-ring rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted hover:text-foreground"
                >
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <p className="min-w-0 flex-1 whitespace-pre-wrap rounded-lg bg-surface px-3 py-2 text-sm text-foreground">
                {message}
              </p>
              <button
                onClick={() => setEditingTemplate(true)}
                aria-label="ערוך את ההודעה"
                className="focus-ring mt-1 shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-gold-ink"
              >
                <Pencil size={13} aria-hidden />
              </button>
            </div>
          )}

          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring flex w-fit items-center gap-1.5 rounded-lg bg-accent-health/20 px-3 py-2 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
            >
              <Send size={13} aria-hidden />
              פתח ב-WhatsApp עם ההודעה
            </a>
          ) : (
            <p className="text-xs text-muted">מספר הטלפון של {displayName} לא תקין, אז אי אפשר לפתוח WhatsApp.</p>
          )}
        </div>
      )}
    </div>
  );
}
