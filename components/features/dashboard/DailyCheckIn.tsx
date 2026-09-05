"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Check, Loader2, TrendingUp } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import {
  buildCheckInProfile,
  energyAdviceForHour,
  shouldPromptCheckIn,
} from "@/lib/checkins/analyze";
import { CHECK_IN_ACTIVITIES, CHECK_IN_ACTIVITY_LABELS, type CheckInActivity } from "@/types";
import { cn } from "@/lib/utils";

/** How long between prompts. Roughly "a few hours", as asked. */
const INTERVAL_HOURS = 3;

const ENERGY_LEVELS = [1, 2, 3, 4, 5] as const;
const ENERGY_LABELS: Record<number, string> = {
  1: "כבוי",
  2: "נמוך",
  3: "בסדר",
  4: "טוב",
  5: "מלא אנרגיה",
};

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// The periodic check-in, and what it has learned.
//
// Two states in one card, deliberately. When it is time to ask, the card is
// the question; the rest of the time it is the answer — what the check-ins
// have established about this hour of this user's day. A widget that shows a
// dismissed prompt and nothing else is a widget people hide.
//
// The prompt is a card rather than a modal. A popup that interrupts whatever
// you were doing every three hours to ask how you feel is the fastest way to
// teach someone to dismiss it without reading it, and a dismissed prompt
// teaches the system nothing. This one waits on the dashboard.
export function DailyCheckIn() {
  const checkIns = useAtlasStore((s) => s.checkIns);
  const addCheckIn = useAtlasStore((s) => s.addCheckIn);

  const [activity, setActivity] = useState<CheckInActivity | null>(null);
  const [energy, setEnergy] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Asking on demand is separate from the interval gate. Clearing `dismissed`
  // alone would do nothing when the interval has not elapsed — which is the
  // usual case for someone who just wants to log something.
  const [manualOpen, setManualOpen] = useState(false);

  // Read after mount, never during render: `new Date()` in a render body
  // differs between the server pass and the client pass, and the whole card
  // would swap under a hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    // Re-checked on an interval so a tab left open overnight starts asking
    // again in the morning instead of staying frozen on last night's answer.
    const timer = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const profile = useMemo(() => buildCheckInProfile(checkIns), [checkIns]);
  const lastCheckInAt = checkIns[0]?.occurredAt ?? null;

  const asking =
    manualOpen ||
    (now !== null &&
      !dismissed &&
      shouldPromptCheckIn({ lastCheckInAt, now, intervalHours: INTERVAL_HOURS }));

  async function submit() {
    if (!activity || !energy || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addCheckIn({ activity, energy });
      setActivity(null);
      setEnergy(null);
      setManualOpen(false);
      // The freshly written check-in resets the interval on its own, so
      // `dismissed` must be cleared too — otherwise the next genuine prompt
      // in three hours would be suppressed by this answer.
      setDismissed(false);
    } catch {
      setError("לא הצלחנו לשמור. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  const advice = now ? energyAdviceForHour(profile, now.getHours()) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Activity size={16} className="text-accent-health" aria-hidden />
        צ׳ק-אין יומי
      </p>

      {asking ? (
        <>
          <p className="text-sm text-foreground/85">מה עשית בשעות האחרונות?</p>

          <div className="flex flex-wrap gap-1.5">
            {CHECK_IN_ACTIVITIES.map((option) => (
              <button
                key={option}
                onClick={() => setActivity(option)}
                aria-pressed={activity === option}
                className={cn(
                  "focus-ring rounded-lg border px-2.5 py-1 text-xs transition-colors",
                  activity === option
                    ? "border-gold-line bg-gold-soft text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {CHECK_IN_ACTIVITY_LABELS[option]}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted">ורמת האנרגיה?</p>
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="רמת אנרגיה">
            {ENERGY_LEVELS.map((level) => (
              <button
                key={level}
                role="radio"
                aria-checked={energy === level}
                aria-label={`${level} — ${ENERGY_LABELS[level]}`}
                onClick={() => setEnergy(level)}
                className={cn(
                  "focus-ring grid size-8 place-items-center rounded-lg border text-xs tabular-nums transition-colors",
                  energy === level
                    ? "border-gold-line bg-gold-soft font-semibold text-gold-ink"
                    : "border-hairline-card text-muted hover:text-foreground"
                )}
              >
                {level}
              </button>
            ))}
            {energy !== null && <span className="ms-1 text-xs text-muted">{ENERGY_LABELS[energy]}</span>}
          </div>

          {error && <p className="text-xs text-accent-family">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              onClick={submit}
              disabled={!activity || !energy || saving}
              className="glass-control focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-40"
            >
              {saving ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <Check size={12} aria-hidden />}
              שמור
            </button>
            {/* Dismissal lasts for this view only, not persisted. The next
                interval should ask again — a permanently silenced prompt
                stops the profile learning, which is the point of it. */}
            <button
              onClick={() => {
                setDismissed(true);
                setManualOpen(false);
              }}
              className="focus-ring rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
            >
              אחר כך
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Nothing is claimed until there is enough to claim it. The
              threshold lives in lib/checkins/analyze.ts, with the reasoning. */}
          {!profile.hasEnoughData ? (
            <p className="text-xs text-muted">
              עוד כמה צ׳ק-אינים ואפשר יהיה להתחיל לזהות את השגרה שלך.
              {profile.totalSamples > 0 && (
                <span className="ltr ms-1 tabular-nums">({profile.totalSamples})</span>
              )}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {advice && (
                <p className="flex items-center gap-1.5 text-sm text-foreground/85">
                  <TrendingUp size={14} className="shrink-0 text-accent-health" aria-hidden />
                  {advice.level === "peak"
                    ? "השעה הזו היא בדרך כלל שיא אנרגיה אצלך."
                    : advice.level === "low"
                      ? "בשעה הזו האנרגיה שלך בדרך כלל נמוכה."
                      : "שעה רגילה מבחינת אנרגיה."}
                  {/* The sample count is shown, not hidden: it is the
                      difference between a finding and a guess, and the
                      reader is entitled to weigh it. */}
                  <span className="ltr shrink-0 text-xs text-muted">({advice.samples})</span>
                </p>
              )}

              {profile.peakHours.length > 0 && (
                <p className="text-xs text-muted">
                  שעות שיא:{" "}
                  <span className="ltr tabular-nums">{profile.peakHours.map(hourLabel).join(", ")}</span>
                </p>
              )}

              {profile.activityMix[0] && (
                <p className="text-xs text-muted">
                  הכי הרבה זמן: {CHECK_IN_ACTIVITY_LABELS[profile.activityMix[0].activity]}{" "}
                  <span className="ltr tabular-nums">
                    ({Math.round(profile.activityMix[0].share * 100)}%)
                  </span>
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setManualOpen(true)}
            className="glass-control-hover focus-ring w-fit rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
          >
            צ׳ק-אין עכשיו
          </button>
        </>
      )}
    </div>
  );
}
