"use client";

import { useEffect, useState } from "react";
import { Bell, Check, Clock, Globe, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { BackToHome } from "@/components/layout/BackToHome";
import {
  getNotificationSettingsAction,
  updateNotificationSettingsAction,
  type NotificationSettings,
  type NotificationSettingsPatch,
} from "@/app/actions/notificationPreferences";
import { NOTIFICATION_KIND_LABELS, NOTIFICATION_KINDS } from "@/lib/proactive/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * A short, curated zone list plus whatever the user is actually in.
 *
 * Intl.supportedValuesOf("timeZone") returns several hundred entries — a
 * select nobody can use on a phone. The device's own zone is detected
 * automatically on load (see AppShell), so this exists for the traveller who
 * wants briefings on home time, not for initial setup.
 */
const COMMON_TIMEZONES = [
  "Asia/Jerusalem",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC",
];

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getNotificationSettingsAction()
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(timer);
  }, [justSaved]);

  // Optimistic, with rollback: these are toggles, and waiting on a round trip
  // to see a switch move makes the page feel broken.
  function save(patch: NotificationSettingsPatch) {
    if (!settings) return;
    const previous = settings;
    setSettings({
      ...settings,
      ...(patch.channelEmail !== undefined ? { channelEmail: patch.channelEmail } : {}),
      ...(patch.quietHoursStart !== undefined ? { quietHoursStart: patch.quietHoursStart } : {}),
      ...(patch.quietHoursEnd !== undefined ? { quietHoursEnd: patch.quietHoursEnd } : {}),
      ...(patch.maxPerDay !== undefined ? { maxPerDay: patch.maxPerDay } : {}),
      ...(patch.mutedKinds !== undefined
        ? { mutedKinds: patch.mutedKinds as NotificationSettings["mutedKinds"] }
        : {}),
      ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
    });
    setSaving(true);
    setSaveError(null);
    updateNotificationSettingsAction(patch)
      .then((updated) => {
        setSettings(updated);
        setJustSaved(true);
      })
      .catch(() => {
        setSettings(previous);
        setSaveError("לא הצלחנו לשמור את השינוי. נסה שוב.");
      })
      .finally(() => setSaving(false));
  }

  return (
    <main className="min-h-screen px-6 py-16 sm:px-10 lg:px-16">
      <BackToHome className="mb-6 -ms-2.5" />
      <h1 className="mb-1 text-2xl font-medium tracking-tight">הגדרות</h1>
      <p className="mb-8 text-sm text-muted">
        מתי ואיך Life Plus פונה אליך. ההתראות תמיד מופיעות באפליקציה — כאן מחליטים מה גם נשלח במייל.
      </p>

      {loading ? (
        <GlassCard>
          <p className="flex items-center gap-2 py-4 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden />
            טוען את ההגדרות…
          </p>
        </GlassCard>
      ) : loadError || !settings ? (
        <GlassCard className="flex flex-col items-start gap-3 py-8">
          <p className="text-sm text-foreground">לא הצלחנו לטעון את ההגדרות.</p>
          <button
            onClick={() => setReloadToken((t) => t + 1)}
            className="focus-ring glass-control rounded-lg px-3 py-1.5 text-xs text-foreground"
          >
            נסה שוב
          </button>
        </GlassCard>
      ) : (
        <div className="flex max-w-2xl flex-col gap-5">
          <div className="flex h-5 items-center gap-2 text-xs" role="status">
            {saving && (
              <span className="flex items-center gap-1.5 text-muted">
                <Loader2 size={12} className="animate-spin" aria-hidden />
                שומר…
              </span>
            )}
            {justSaved && !saving && (
              <span className="flex items-center gap-1.5 text-accent-health">
                <Check size={12} aria-hidden />
                נשמר
              </span>
            )}
            {saveError && <span className="text-red-500">{saveError}</span>}
          </div>

          <GlassCard>
            <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
              <Mail size={16} className="text-accent-career" aria-hidden />
              מיילים
            </p>
            <label className="flex cursor-pointer items-start justify-between gap-4">
              <span>
                <span className="block text-sm text-foreground">קבלת התראות במייל</span>
                <span className="mt-0.5 block text-xs text-muted">
                  תדריך הבוקר, תזכורות ותובנות יישלחו גם לתיבה שלך.
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.channelEmail}
                onChange={(e) => save({ channelEmail: e.target.checked })}
                className="focus-ring mt-1 size-4 shrink-0 accent-[var(--gold)]"
              />
            </label>
          </GlassCard>

          <GlassCard>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
              <Clock size={16} className="text-accent-time" aria-hidden />
              שעות שקט
            </p>
            <p className="mb-4 text-xs text-muted">
              בשעות האלה לא יישלחו מיילים. ההתראות עדיין מחכות לך באפליקציה ונשלחות כשהחלון נגמר.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted">
                מ־
                <select
                  value={settings.quietHoursStart}
                  onChange={(e) => save({ quietHoursStart: Number(e.target.value) })}
                  className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                עד
                <select
                  value={settings.quietHoursEnd}
                  onChange={(e) => save({ quietHoursEnd: Number(e.target.value) })}
                  className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {hourLabel(h)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {settings.quietHoursStart === settings.quietHoursEnd && (
              <p className="mt-3 text-xs text-muted">
                השעות זהות, כך שאין כרגע חלון שקט — מיילים יישלחו בכל שעה.
              </p>
            )}

            <div className="mt-5 border-t border-hairline-card pt-4">
              <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
                מקסימום התראות ביום
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxPerDay}
                  onChange={(e) => save({ maxPerDay: Number(e.target.value) })}
                  className="focus-ring w-20 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground"
                />
              </label>
            </div>
          </GlassCard>

          <GlassCard>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
              <Globe size={16} className="text-accent-learning" aria-hidden />
              אזור זמן
            </p>
            <p className="mb-4 text-xs text-muted">
              קובע מתי “בוקר” הוא בוקר. נקבע אוטומטית לפי המכשיר — שנה רק אם אתה רוצה זמן אחר.
            </p>
            <select
              value={settings.timezone}
              onChange={(e) => save({ timezone: e.target.value })}
              className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1.5 text-sm text-foreground"
            >
              {/* The stored zone is included even when it isn't in the curated
                  list, so a detected zone is never silently replaced by
                  whichever option happens to be first. */}
              {[...new Set([settings.timezone, ...COMMON_TIMEZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </GlassCard>

          <GlassCard>
            <p className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
              <Bell size={16} className="text-accent-faith" aria-hidden />
              סוגי התראות
            </p>
            <p className="mb-4 text-xs text-muted">
              כיבוי סוג מסוים מפסיק אותו לגמרי — גם באפליקציה וגם במייל.
            </p>
            <ul className="flex flex-col gap-2.5">
              {NOTIFICATION_KINDS.map((kind) => {
                const muted = settings.mutedKinds.includes(kind);
                return (
                  <li key={kind}>
                    <label className="flex cursor-pointer items-center justify-between gap-4">
                      <span className={cn("text-sm", muted ? "text-muted" : "text-foreground")}>
                        {NOTIFICATION_KIND_LABELS[kind]}
                      </span>
                      <input
                        type="checkbox"
                        checked={!muted}
                        onChange={(e) =>
                          save({
                            mutedKinds: e.target.checked
                              ? settings.mutedKinds.filter((k) => k !== kind)
                              : [...settings.mutedKinds, kind],
                          })
                        }
                        className="focus-ring size-4 shrink-0 accent-[var(--gold)]"
                      />
                    </label>
                  </li>
                );
              })}
            </ul>
          </GlassCard>
        </div>
      )}
    </main>
  );
}
