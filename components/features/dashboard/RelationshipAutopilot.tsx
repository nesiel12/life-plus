"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Gift, HeartHandshake, Loader2, MessageCircle, X } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { describeNeglect, findNeglected, type NeglectCandidate } from "@/lib/family/neglect";
import { buildMessage, whatsappLink } from "@/lib/family/whatsapp";

/**
 * Who to reach out to, with the message already written.
 *
 * The family CRM has tracked `last_meaningful_interaction` since it was
 * built, and nothing ever surfaced it proactively — the data was there and
 * the reminder was not. This closes that: the dashboard names the two or
 * three people who have quietly slipped, and the WhatsApp button opens with
 * their saved message already filled in.
 *
 * "Talked to them" logs the interaction, which is what stops the same person
 * being suggested again tomorrow — the dismissal has to update the underlying
 * fact, not just hide the card.
 */
export function RelationshipAutopilot() {
  const people = useAtlasStore((s) => s.people);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const signals = useMemo(() => {
    const candidates: NeglectCandidate[] = people.map((p) => ({
      id: p.id,
      name: p.name,
      hebrewName: p.hebrewName,
      relation: p.relation,
      phone: p.phone,
      lastMeaningfulInteraction: p.lastMeaningfulInteraction,
      birthday: p.birthday,
      // People predate this feature and carry no createdAt in the app shape;
      // their last interaction is the honest anchor, and where that is also
      // missing the epoch makes them maximally overdue — which is correct for
      // a contact that has genuinely never been logged.
      createdAt: p.lastMeaningfulInteraction ?? new Date(0).toISOString(),
    }));
    return findNeglected(candidates, new Date()).filter((s) => !dismissed.has(s.person.id));
  }, [people, dismissed]);

  const markContacted = useCallback(
    async (personId: string) => {
      setBusyId(personId);
      try {
        await logPersonInteraction(personId);
      } catch {
        // The optimistic store update already rolled back; hiding the row
        // anyway would claim something that did not happen.
        return;
      } finally {
        setBusyId(null);
      }
    },
    [logPersonInteraction]
  );

  if (signals.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-muted">
          <HeartHandshake size={16} className="text-accent-family" aria-hidden />
          קשרים
        </p>
        <p className="text-sm text-foreground">אתה מעודכן עם כולם.</p>
        <p className="text-xs text-muted">כשמישהו ייעלם מהרדאר, הוא יופיע כאן.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <HeartHandshake size={16} className="text-accent-family" aria-hidden />
        כדאי ליצור קשר
      </p>

      <ul className="flex flex-col gap-2.5">
        {signals.map((signal) => {
          const contact = people.find((p) => p.id === signal.person.id);
          const displayName = signal.person.hebrewName ?? signal.person.name;
          const message = contact
            ? buildMessage({
                role: contact.role ?? "other",
                gender: contact.gender,
                name: displayName,
                customTemplate: contact.messageTemplate,
              })
            : "";
          const link = contact?.phone ? whatsappLink(contact.phone, message) : null;

          return (
            <li
              key={signal.person.id}
              className="flex flex-col gap-2 rounded-xl border border-hairline-card bg-surface-sunken/50 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  {signal.birthdayInDays !== undefined && (
                    <Gift size={13} className="shrink-0 text-accent-family" aria-hidden />
                  )}
                  {describeNeglect(signal)}
                </p>
                <button
                  onClick={() => setDismissed((d) => new Set(d).add(signal.person.id))}
                  aria-label={`הסתר את ${displayName}`}
                  className="focus-ring grid size-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:text-foreground"
                >
                  <X size={12} aria-hidden />
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={message}
                    // Opening WhatsApp is not proof of a conversation, so it
                    // deliberately does NOT log the interaction — only the
                    // explicit button below does.
                    className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
                  >
                    <MessageCircle size={12} aria-hidden />
                    WhatsApp
                  </a>
                ) : (
                  <span className="rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted">
                    אין מספר שמור
                  </span>
                )}

                <button
                  onClick={() => markContacted(signal.person.id)}
                  disabled={busyId === signal.person.id}
                  className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
                >
                  {busyId === signal.person.id ? (
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                  ) : (
                    <Check size={12} aria-hidden />
                  )}
                  דיברנו
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
