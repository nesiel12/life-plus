"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlarmClock, BellRing, Check, Plus, Trash2, X } from "lucide-react";
import { Modal, Z_INDEX } from "@/components/ui/Modal";
import {
  addReminder,
  clearFired,
  markFired,
  removeReminder,
  splitDue,
  useReminders,
  type Reminder,
} from "@/lib/reminders/store";
import { startChime } from "@/lib/reminders/chime";
import { cn } from "@/lib/utils";

const QUICK_OFFSETS: { label: string; minutes: number }[] = [
  { label: "+5 דק׳", minutes: 5 },
  { label: "+15 דק׳", minutes: 15 },
  { label: "+30 דק׳", minutes: 30 },
  { label: "+שעה", minutes: 60 },
];

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = formatClock(ms);
  if (sameDay(d, today)) return `היום ${time}`;
  if (sameDay(d, tomorrow)) return `מחר ${time}`;
  return `${d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" })} ${time}`;
}

function countdown(ms: number, now: number): string {
  const diff = Math.max(0, ms - now);
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "עוד פחות מדקה";
  if (mins < 60) return `עוד ${mins} דק׳`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `עוד ${hrs} ש׳ ${rem} דק׳` : `עוד ${hrs} ש׳`;
  return `עוד ${Math.round(hrs / 24)} ימים`;
}

/** Turn an "HH:MM" wall-clock into the next epoch-ms that matches it. */
function nextTimeToday(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  const target = new Date();
  target.setHours(h, min, 0, 0);
  if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export function AlarmCenter() {
  const reminders = useReminders();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("");
  const [sound, setSound] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [ringing, setRinging] = useState<Reminder | null>(null);
  const stopChimeRef = useRef<(() => void) | null>(null);

  const upcoming = useMemo(
    () => reminders.filter((r) => r.firedAt === null).sort((a, b) => a.at - b.at),
    [reminders]
  );
  const fired = useMemo(
    () => reminders.filter((r) => r.firedAt !== null).sort((a, b) => (b.firedAt ?? 0) - (a.firedAt ?? 0)),
    [reminders]
  );

  // One ticking clock drives both the countdown labels and the due check.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // The runner. Fires at most one alarm at a time; stale ones are retired
  // silently so a laptop opened hours later does not erupt in beeps.
  useEffect(() => {
    const { ring, stale } = splitDue(now);
    for (const r of stale) markFired(r.id);
    if (!ringing && ring.length > 0) {
      const next = ring[0];
      setRinging(next);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("תזכורת", { body: next.label });
        } catch {
          /* some browsers require a service worker — the banner covers it */
        }
      }
    }
  }, [now, ringing]);

  // Start/stop the chime alongside the ringing banner.
  useEffect(() => {
    if (ringing && ringing.sound) {
      stopChimeRef.current = startChime();
    }
    return () => {
      stopChimeRef.current?.();
      stopChimeRef.current = null;
    };
  }, [ringing]);

  const dismissRinging = useCallback(() => {
    if (ringing) markFired(ringing.id);
    setRinging(null);
  }, [ringing]);

  function handleAdd() {
    const trimmed = label.trim();
    const at = nextTimeToday(time);
    if (!trimmed || at === null) return;
    if (sound && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    addReminder({ label: trimmed, at, sound });
    setLabel("");
    setTime("");
  }

  function handleQuick(minutes: number) {
    const trimmed = label.trim();
    if (!trimmed) return;
    if (sound && typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    addReminder({ label: trimmed, at: Date.now() + minutes * 60000, sound });
    setLabel("");
    setTime("");
  }

  return (
    <>
      {/* Ringing banner — its own overlay above everything, since an alarm
          the user set is, by definition, the most important thing on screen
          the moment it goes off. */}
      <AnimatePresence>
        {ringing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="alertdialog"
            aria-modal="true"
            aria-label="תזכורת"
            className="fixed inset-0 z-[90] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, y: -12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 24 }}
              className="glass-panel glass-glow w-full max-w-sm rounded-3xl p-6 text-center"
            >
              <motion.span
                animate={{ rotate: [0, -12, 12, -8, 8, 0] }}
                transition={{ duration: 0.9, repeat: Infinity, repeatDelay: 0.4 }}
                className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-accent-faith/15 text-accent-faith"
              >
                <BellRing size={26} aria-hidden />
              </motion.span>
              <p className="text-lg font-medium text-foreground">{ringing.label}</p>
              <p className="mt-1 text-sm text-muted">{formatClock(ringing.at)}</p>
              <button
                onClick={dismissRinging}
                className="focus-ring mt-5 w-full rounded-xl bg-accent-faith/20 px-4 py-2.5 text-sm font-medium text-accent-faith transition-opacity hover:opacity-80"
              >
                עצור
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        backdrop={false}
        zIndex={Z_INDEX.panel}
        panelClassName="top-4 bottom-20 right-4 flex w-[calc(100%-2rem)] max-w-sm flex-col sm:bottom-4 sm:w-[22rem]"
      >
        <div className="flex items-center justify-between border-b border-glass-border px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlarmClock size={18} className="text-accent-faith" aria-hidden />
            תזכורות ושעון מעורר
          </span>
          <button
            onClick={() => setOpen(false)}
            className="focus-ring rounded-lg p-1.5 text-muted transition-colors hover:bg-fill-subtle hover:text-foreground"
            aria-label="סגור"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="על מה להזכיר?"
            aria-label="תיאור התזכורת"
            className="focus-ring rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
          />

          <div className="flex flex-wrap gap-1.5">
            {QUICK_OFFSETS.map((q) => (
              <button
                key={q.minutes}
                onClick={() => handleQuick(q.minutes)}
                disabled={!label.trim()}
                className="focus-ring rounded-lg border border-hairline-card px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground disabled:opacity-40"
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label="שעה מדויקת"
              className="focus-ring flex-1 rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground"
            />
            <button
              onClick={handleAdd}
              disabled={!label.trim() || !time}
              className="focus-ring flex items-center gap-1 rounded-lg bg-accent-faith/20 px-3 py-2 text-sm text-accent-faith transition-opacity disabled:opacity-40"
            >
              <Plus size={14} aria-hidden />
              קבע
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={sound}
              onChange={(e) => setSound(e.target.checked)}
              className="focus-ring size-3.5 rounded border-hairline-card accent-[var(--accent-faith)]"
            />
            השמע צליל כשמגיע הזמן
          </label>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-glass-border px-4 py-3">
          {upcoming.length === 0 && fired.length === 0 && (
            <p className="py-6 text-center text-xs text-muted">אין תזכורות מתוכננות.</p>
          )}

          {upcoming.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {upcoming.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-fill-subtle px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-foreground">{r.label}</p>
                    <p className="text-xs text-muted">
                      {formatWhen(r.at)} · {countdown(r.at, now)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeReminder(r.id)}
                    aria-label="מחק תזכורת"
                    className="focus-ring shrink-0 rounded-lg p-1 text-muted transition-colors hover:text-accent-family"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {fired.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[11px] font-medium text-muted">היו</p>
                <button
                  onClick={clearFired}
                  className="focus-ring rounded px-1 text-[11px] text-muted transition-colors hover:text-foreground"
                >
                  נקה
                </button>
              </div>
              <ul className="flex flex-col gap-1">
                {fired.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 px-3 py-1 text-xs text-muted">
                    <Check size={12} className="shrink-0 text-accent-time" aria-hidden />
                    <span className="truncate">{r.label}</span>
                    <span className="ms-auto shrink-0">{formatClock(r.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>

      <motion.button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Right edge on a phone (opposite the AI companion, which sits
          // bottom-left). From `sm` the right edge is the sidebar, so the
          // offsets clear its rail — 5rem wide at sm, 16rem at lg — instead of
          // floating over its settings and sign-out controls.
          "glass-control fixed bottom-36 right-4 flex size-12 items-center justify-center rounded-full text-foreground shadow-lg sm:bottom-24 sm:right-24 lg:right-72",
          Z_INDEX.panel
        )}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.96 }}
        aria-label="תזכורות ושעון מעורר"
      >
        <AlarmClock size={20} aria-hidden />
        {upcoming.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent-faith px-1 text-[10px] font-semibold text-background">
            {upcoming.length}
          </span>
        )}
      </motion.button>
    </>
  );
}
