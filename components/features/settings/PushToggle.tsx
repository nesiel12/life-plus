"use client";

import { BellRing, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { usePushNotifications } from "@/hooks/usePushNotifications";

interface PushToggleProps {
  /** The stored `channelPush` preference. */
  enabled: boolean;
  /** Persist the preference (settings page's `save`). */
  onChangePref: (enabled: boolean) => void;
}

// Push notifications for the Daily Backbone alerts. Two things have to be true
// for these to arrive: the `channel_push` preference is on, AND this browser
// holds a live pushManager subscription. The toggle drives both — flipping it
// on requests OS permission and subscribes; flipping it off unsubscribes this
// browser and clears the preference.
export function PushToggle({ enabled, onChangePref }: PushToggleProps) {
  const { state, busy, error, enable, disable } = usePushNotifications();

  const on = enabled && state === "on";

  async function toggle(next: boolean) {
    if (next) {
      await enable();
      onChangePref(true);
    } else {
      await disable();
      onChangePref(false);
    }
  }

  return (
    <GlassCard>
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
        <BellRing size={16} className="text-accent-career" aria-hidden />
        התראות Push למכשיר
      </p>
      <p className="mb-4 text-xs text-muted">
        התראה במכשיר לפני כל בלוק בשגרה היומית (למשל: אימון בעוד 20 דקות), גם כשהאפליקציה סגורה.
        דורש התקנת האפליקציה למסך הבית בטלפון.
      </p>

      {state === "unsupported" && (
        <p className="text-xs text-muted">הדפדפן הזה לא תומך בהתראות Push.</p>
      )}
      {state === "unconfigured" && (
        <p className="text-xs text-muted">התראות Push לא מוגדרות בשרת.</p>
      )}
      {state === "denied" && (
        <p className="text-xs text-accent-family">
          חסמת התראות לאתר הזה. פתח את הגדרות האתר בדפדפן כדי לאפשר, ואז חזור לכאן.
        </p>
      )}

      {(state === "on" || state === "off" || state === "loading") && (
        <label className="flex cursor-pointer items-center justify-between gap-4">
          <span className="text-sm text-foreground">
            {state === "loading" ? "בודק…" : on ? "פעיל במכשיר הזה" : "כבוי"}
          </span>
          <span className="flex items-center gap-2">
            {busy && <Loader2 size={13} className="animate-spin text-muted" aria-hidden />}
            <input
              type="checkbox"
              checked={on}
              disabled={busy || state === "loading"}
              onChange={(e) => void toggle(e.target.checked)}
              className="focus-ring size-4 shrink-0 accent-[var(--gold)]"
            />
          </span>
        </label>
      )}

      {error && <p className="mt-2 text-xs text-accent-family">{error}</p>}
    </GlassCard>
  );
}
