"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  HeartHandshake,
  Cake,
  Heart,
  Phone,
  MessageCircle,
  Users,
  Gift,
  Check,
  X,
  History,
  CalendarClock,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { PersonAvatar } from "@/components/ui/PersonAvatar";
import { daysUntilNextAnnualDate } from "@/lib/utils";
import type { Person } from "@/types";
import type { PersonInsight, RelationshipHealth, SuggestedActionType } from "@/lib/family/types";

const HEALTH_CONFIG: Record<RelationshipHealth, { label: string; colorClass: string }> = {
  healthy: { label: "בריא", colorClass: "text-accent-health" },
  growing: { label: "מתפתח", colorClass: "text-accent-knowledge" },
  needs_attention: { label: "זקוק לתשומת לב", colorClass: "text-accent-family" },
};

const ACTION_ICON: Record<SuggestedActionType, LucideIcon> = {
  call: Phone,
  message: MessageCircle,
  meet: Users,
  congratulate: Gift,
};

interface MeetupSuggestion {
  available: boolean;
  slots: { start: string; end: string }[];
  locationSuggestion: string | null;
  note: string;
}

// The birthday/anniversary "add a date" affordance, identical in shape for
// both fields (Relationship CRM, docs/ATLAS_ARCHITECTURE_VISION.md §13) —
// one implementation instead of two copies of the same edit/save flow.
function InlineDateField({
  label,
  ariaLabel,
  onSave,
}: {
  label: string;
  ariaLabel: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function save() {
    if (/^\d{2}-\d{2}$/.test(draft)) onSave(draft);
    setEditing(false);
    setDraft("");
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="focus-ring text-xs text-muted transition-colors hover:text-foreground"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && save()}
        placeholder="MM-DD"
        aria-label={ariaLabel}
        className="focus-ring ltr w-20 rounded-lg bg-fill-subtle px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
        autoFocus
      />
      <button onClick={save} className="focus-ring text-xs text-accent-family">
        שמור
      </button>
    </div>
  );
}

interface PersonRelationshipCardProps {
  person: Person;
  insight: PersonInsight | undefined;
  delay: number;
  onLogMoment: (personId: string, name: string) => void;
  onAcceptAction: (personId: string, recommendationEventId: string, name: string) => void;
  onDismissAction: (recommendationEventId: string) => void;
  onSaveBirthday: (personId: string, birthday: string) => void;
  onSaveAnniversary: (personId: string, anniversary: string) => void;
  onEdit: (person: Person) => void;
}

export function PersonRelationshipCard({
  person,
  insight,
  delay,
  onLogMoment,
  onAcceptAction,
  onDismissAction,
  onSaveBirthday,
  onSaveAnniversary,
  onEdit,
}: PersonRelationshipCardProps) {
  const [showTimeline, setShowTimeline] = useState(false);
  const [meetup, setMeetup] = useState<MeetupSuggestion | null>(null);
  const [loadingMeetup, setLoadingMeetup] = useState(false);
  const [bookingSlotStart, setBookingSlotStart] = useState<string | null>(null);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [bookingError, setBookingError] = useState<string | null>(null);

  const displayName = person.hebrewName ?? person.name;
  const health = insight ? HEALTH_CONFIG[insight.health] : null;
  const untilBirthday = person.birthday ? daysUntilNextAnnualDate(person.birthday) : null;
  const untilAnniversary = person.anniversary ? daysUntilNextAnnualDate(person.anniversary) : null;
  const ActionIcon = insight?.suggestedAction ? ACTION_ICON[insight.suggestedAction.type] : null;

  // Meeting Coordinator (docs/ATLAS_ARCHITECTURE_VISION.md §13): fetched
  // on demand, not automatically — this is the user's own calendar
  // availability, not a background computation every card needs to pay for
  // on every render.
  function handleSuggestMeetup() {
    setLoadingMeetup(true);
    fetch("/api/family/meetup-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personId: person.id }),
    })
      .then((res) => res.json())
      .then((data: MeetupSuggestion) => setMeetup(data))
      .catch(() =>
        setMeetup({ available: false, slots: [], locationSuggestion: null, note: "לא הצלחתי לבדוק זמנים כרגע." })
      )
      .finally(() => setLoadingMeetup(false));
  }

  // Actually books the slot into the real Google Calendar — the same
  // POST app/api/calendar/events already uses when a schedule suggestion
  // is accepted (Today), reused as-is rather than a second event-creation
  // path. Deliberately does NOT also log a moment: a moment records
  // something that already happened, and this is a future meeting that
  // hasn't yet — fabricating a past interaction for a scheduled one would
  // be exactly the invented-record this app's intelligence layer avoids
  // everywhere else.
  function handleBookSlot(slot: { start: string; end: string }) {
    setBookingSlotStart(slot.start);
    setBookingError(null);
    fetch("/api/calendar/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `פגישה עם ${displayName}`, start: slot.start, end: slot.end }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "הקביעה נכשלה.");
        }
        setBookedSlots((prev) => new Set(prev).add(slot.start));
      })
      .catch((err) => setBookingError(err instanceof Error ? err.message : "הקביעה נכשלה."))
      .finally(() => setBookingSlotStart(null));
  }

  return (
    <GlassCard delay={delay} className="h-full">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <PersonAvatar person={person} size={40} />
          <div>
            <p className="font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted">{person.relation}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {health ? (
            <span className={`flex items-center gap-1 text-xs font-medium ${health.colorClass}`}>
              <HeartHandshake size={14} aria-hidden />
              {health.label}
            </span>
          ) : (
            <span className="h-3 w-14 animate-pulse rounded-full bg-fill-subtle" aria-hidden />
          )}
          <button
            onClick={() => onEdit(person)}
            aria-label={`ערוך את ${displayName}`}
            className="focus-ring rounded-lg p-1 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      {person.note && <p className="mb-2 text-sm text-foreground/70">{person.note}</p>}

      {insight ? (
        <p className="mb-2 text-xs text-muted">
          {insight.daysSinceLastInteraction === null
            ? "אין עדיין תיעוד"
            : insight.daysSinceLastInteraction === 0
              ? "רגע היום"
              : `לפני ${insight.daysSinceLastInteraction} ימים`}
          {insight.interactionCount > 0 && ` · ${insight.interactionCount} רגעים מתועדים`}
        </p>
      ) : (
        <div className="mb-2 h-3 w-32 animate-pulse rounded-full bg-fill-subtle" aria-hidden />
      )}

      {untilBirthday !== null && (
        <p className="mb-2 flex items-center gap-1 text-xs text-accent-family">
          <Cake size={12} aria-hidden />
          יום הולדת בעוד {untilBirthday} ימים
        </p>
      )}

      {untilAnniversary !== null && (
        <p className="mb-2 flex items-center gap-1 text-xs text-accent-family">
          <Heart size={12} aria-hidden />
          יום נישואין בעוד {untilAnniversary} ימים
        </p>
      )}

      {insight?.suggestedAction && ActionIcon && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-3 rounded-xl bg-fill-subtle p-3"
        >
          <p className="mb-1 flex items-center gap-1 text-xs text-muted">
            <ActionIcon size={12} aria-hidden />
            {insight.suggestedAction.label}
          </p>
          <p className="mb-2 text-xs leading-relaxed text-foreground/70">{insight.suggestedAction.rationale}</p>

          <ConfidenceBar value={insight.suggestedAction.confidence} ariaLabel="רמת התאמה של ההצעה" className="mb-2" />

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onAcceptAction(person.id, insight.suggestedAction!.recommendationEventId, displayName)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
            >
              <Check size={12} aria-hidden />
              עשיתי את זה
            </button>
            <button
              onClick={() => onDismissAction(insight.suggestedAction!.recommendationEventId)}
              className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground"
            >
              <X size={12} aria-hidden />
              לא עכשיו
            </button>
          </div>
        </motion.div>
      )}

      {insight && (insight.timeline.length > 0 || insight.relatedMemory.length > 0) && (
        <div className="mb-3">
          <button
            onClick={() => setShowTimeline((v) => !v)}
            className="focus-ring flex items-center gap-1 rounded-lg px-1 text-xs text-muted transition-colors hover:text-foreground"
          >
            <History size={12} aria-hidden />
            {showTimeline ? "הסתר היסטוריית קשר" : "הצג היסטוריית קשר"}
          </button>
          {showTimeline && (
            <div className="mt-2 flex flex-col gap-2 rounded-lg bg-fill-subtle p-3 text-xs">
              {insight.relatedMemory.map((line, i) => (
                <p key={`mem-${i}`} className="text-foreground/70">
                  {line}
                </p>
              ))}
              {insight.timeline.slice(0, 5).map((event) => (
                <div key={event.id} className="flex items-center justify-between text-foreground/70">
                  <span>{event.title}</span>
                  <span className="ltr text-muted">{event.timestamp.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {person.phone && (
          <>
            <a
              href={`tel:${person.phone.replace(/[^\d+]/g, "")}`}
              aria-label={`התקשר ל${displayName}`}
              className="focus-ring flex size-8 items-center justify-center rounded-full bg-accent-knowledge/15 text-accent-knowledge transition-transform hover:scale-110 hover:bg-accent-knowledge/25"
            >
              <Phone size={14} />
            </a>
            <a
              href={`https://wa.me/${person.phone.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`שלח הודעת WhatsApp ל${displayName}`}
              className="focus-ring flex size-8 items-center justify-center rounded-full bg-accent-health/15 text-accent-health transition-transform hover:scale-110 hover:bg-accent-health/25"
            >
              <MessageCircle size={14} />
            </a>
          </>
        )}

        <button
          onClick={() => onLogMoment(person.id, displayName)}
          className="focus-ring rounded-lg bg-accent-family/15 px-3 py-1.5 text-xs text-accent-family transition-opacity hover:opacity-80"
        >
          רשום רגע איתם
        </button>

        <button
          onClick={handleSuggestMeetup}
          disabled={loadingMeetup}
          className="focus-ring flex items-center gap-1 rounded-lg bg-fill-subtle px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          <CalendarClock size={12} aria-hidden />
          {loadingMeetup ? "בודק זמנים…" : "הצע להיפגש"}
        </button>

        {!person.birthday && (
          <InlineDateField
            label="הוסף יום הולדת"
            ariaLabel={`תאריך יום הולדת של ${displayName} (חודש-יום)`}
            onSave={(value) => onSaveBirthday(person.id, value)}
          />
        )}

        {!person.anniversary && (
          <InlineDateField
            label="הוסף יום נישואין"
            ariaLabel={`תאריך יום נישואין עם ${displayName} (חודש-יום)`}
            onSave={(value) => onSaveAnniversary(person.id, value)}
          />
        )}
      </div>

      {meetup && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-3 rounded-xl bg-fill-subtle p-3 text-xs"
        >
          <p className="mb-2 text-foreground/70">{meetup.note}</p>
          {meetup.slots.length > 0 && (
            <ul className="mb-2 flex flex-col gap-1.5 text-foreground/90">
              {meetup.slots.map((slot) => {
                const booked = bookedSlots.has(slot.start);
                return (
                  <li key={slot.start} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                      <CalendarClock size={11} aria-hidden />
                      <span className="ltr">
                        {new Date(slot.start).toLocaleString("he-IL", {
                          weekday: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    {booked ? (
                      <span className="flex items-center gap-1 text-accent-health">
                        <Check size={12} aria-hidden />
                        נקבע ביומן
                      </span>
                    ) : (
                      <button
                        onClick={() => handleBookSlot(slot)}
                        disabled={bookingSlotStart === slot.start}
                        className="focus-ring rounded-lg bg-accent-faith/15 px-2 py-1 text-accent-faith transition-opacity hover:opacity-80 disabled:opacity-50"
                      >
                        {bookingSlotStart === slot.start ? "קובע…" : "קבע פגישה"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {meetup.locationSuggestion && (
            <p className="mb-1 text-muted">מקום מוצע: {meetup.locationSuggestion}</p>
          )}
          {bookingError && <p className="text-accent-family">{bookingError}</p>}
        </motion.div>
      )}
    </GlassCard>
  );
}
