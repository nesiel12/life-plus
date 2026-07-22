"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  HeartHandshake,
  Cake,
  Phone,
  MessageCircle,
  Users,
  Gift,
  Check,
  X,
  History,
  type LucideIcon,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { daysUntilNextBirthday } from "@/lib/utils";
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

interface PersonRelationshipCardProps {
  person: Person;
  insight: PersonInsight | undefined;
  delay: number;
  onLogMoment: (personId: string, name: string) => void;
  onAcceptAction: (personId: string, recommendationEventId: string, name: string) => void;
  onDismissAction: (recommendationEventId: string) => void;
  onSaveBirthday: (personId: string, birthday: string) => void;
}

export function PersonRelationshipCard({
  person,
  insight,
  delay,
  onLogMoment,
  onAcceptAction,
  onDismissAction,
  onSaveBirthday,
}: PersonRelationshipCardProps) {
  const [editingBirthday, setEditingBirthday] = useState(false);
  const [birthdayDraft, setBirthdayDraft] = useState("");
  const [showTimeline, setShowTimeline] = useState(false);

  const displayName = person.hebrewName ?? person.name;
  const health = insight ? HEALTH_CONFIG[insight.health] : null;
  const untilBirthday = person.birthday ? daysUntilNextBirthday(person.birthday) : null;
  const ActionIcon = insight?.suggestedAction ? ACTION_ICON[insight.suggestedAction.type] : null;

  function saveBirthday() {
    if (/^\d{2}-\d{2}$/.test(birthdayDraft)) {
      onSaveBirthday(person.id, birthdayDraft);
    }
    setEditingBirthday(false);
    setBirthdayDraft("");
  }

  return (
    <GlassCard delay={delay} className="h-full">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="font-medium text-foreground">{displayName}</p>
          <p className="text-xs text-muted">{person.relation}</p>
        </div>
        {health ? (
          <span className={`flex items-center gap-1 text-xs font-medium ${health.colorClass}`}>
            <HeartHandshake size={14} aria-hidden />
            {health.label}
          </span>
        ) : (
          <span className="h-3 w-14 animate-pulse rounded-full bg-white/5" aria-hidden />
        )}
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
        <div className="mb-2 h-3 w-32 animate-pulse rounded-full bg-white/5" aria-hidden />
      )}

      {untilBirthday !== null && (
        <p className="mb-2 flex items-center gap-1 text-xs text-accent-family">
          <Cake size={12} aria-hidden />
          יום הולדת בעוד {untilBirthday} ימים
        </p>
      )}

      {insight?.suggestedAction && ActionIcon && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mb-3 rounded-xl bg-white/5 p-3"
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
              className="focus-ring flex items-center gap-1 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-muted transition-opacity hover:text-foreground"
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
            <div className="mt-2 flex flex-col gap-2 rounded-lg bg-white/5 p-3 text-xs">
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
        <button
          onClick={() => onLogMoment(person.id, displayName)}
          className="focus-ring rounded-lg bg-accent-family/15 px-3 py-1.5 text-xs text-accent-family transition-opacity hover:opacity-80"
        >
          רשום רגע איתם
        </button>

        {editingBirthday ? (
          <div className="flex items-center gap-1">
            <input
              value={birthdayDraft}
              onChange={(e) => setBirthdayDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveBirthday()}
              placeholder="MM-DD"
              aria-label={`תאריך יום הולדת של ${displayName} (חודש-יום)`}
              className="focus-ring ltr w-20 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
              autoFocus
            />
            <button onClick={saveBirthday} className="focus-ring text-xs text-accent-family">
              שמור
            </button>
          </div>
        ) : (
          !person.birthday && (
            <button
              onClick={() => setEditingBirthday(true)}
              className="focus-ring text-xs text-muted transition-colors hover:text-foreground"
            >
              הוסף יום הולדת
            </button>
          )
        )}
      </div>
    </GlassCard>
  );
}
