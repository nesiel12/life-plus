"use client";

import { Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import type { NotificationKind } from "@/lib/proactive/types";

const CATEGORIES: { title: string; description: string; kinds: NotificationKind[] }[] = [
  {
    title: "תדריך יומי ו-AI",
    description: "סיכום הבוקר והתובנה היומית שלך.",
    kinds: ["daily_insight", "briefing_ready"],
  },
  {
    title: "תזכורות דחופות למשימות",
    description: "אירועים ומעברים בלוז שדורשים תשומת לב עכשיו.",
    kinds: ["reminder_event", "schedule_transition"],
  },
  {
    title: "יעדים שנתקעו",
    description: "כשיעד לא זז הרבה זמן, ותהיה תועלת בבדיקה.",
    kinds: ["milestone_slipping"],
  },
];

interface EmailPreferencesProps {
  /** The stored `emailMutedKinds` preference. */
  emailMutedKinds: NotificationKind[];
  /** Persist the preference (settings page's `save`). */
  onSave: (patch: { emailMutedKinds: string[] }) => void;
}

// Narrower than the "סוגי התראות" mute-everywhere list below it: this only
// withholds email for a category — it still shows up in the in-app
// notification centre (and over push/WhatsApp, if those are on) exactly as
// before. Scoped to the 3 categories a real proactive job actually produces
// (see lib/proactive/jobs/) rather than all 11 generic kinds, so every
// toggle here does something.
export function EmailPreferences({ emailMutedKinds, onSave }: EmailPreferencesProps) {
  function toggle(kinds: NotificationKind[], enabled: boolean) {
    const next = enabled
      ? emailMutedKinds.filter((k) => !kinds.includes(k))
      : [...new Set([...emailMutedKinds, ...kinds])];
    onSave({ emailMutedKinds: next });
  }

  return (
    <GlassCard>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        <Mail size={16} className="text-accent-career" aria-hidden />
        מה נשלח במייל
      </p>
      <p className="mb-4 text-xs text-muted">
        עדיין רואים הכל במרכז ההתראות באפליקציה — זה קובע רק מה גם מגיע לתיבה שלך.
      </p>
      <ul className="flex flex-col gap-3">
        {CATEGORIES.map((cat) => {
          const enabled = cat.kinds.some((k) => !emailMutedKinds.includes(k));
          return (
            <li key={cat.title}>
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm text-foreground">{cat.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{cat.description}</span>
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggle(cat.kinds, e.target.checked)}
                  className="focus-ring mt-1 size-4 shrink-0 accent-[var(--gold)]"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
