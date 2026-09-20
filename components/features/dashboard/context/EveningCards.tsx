"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, HeartHandshake, MessageCircle, NotebookPen, Repeat, Sprout } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { localDateKey } from "@/lib/dashboard/contextData";
import { buildOutreachDrafts } from "@/lib/intelligence/crossModule/familyOutreach";
import { requestQuickCapture } from "@/lib/capture/quickCaptureEvent";
import { ContextCardShell } from "@/components/features/dashboard/context/ContextCardShell";
import { cn } from "@/lib/utils";

/**
 * קשר משפחתי — who has quietly fallen off the radar, and a message ready to
 * send. The engine (lib/intelligence/crossModule/familyOutreach.ts) joins the
 * neglect detection to the WhatsApp generator: the button opens WhatsApp with
 * the draft pre-filled and the person presses send. Nothing is sent from here,
 * and the app can't know whether it was, so "יצרתי קשר" is the person's own
 * word for it — it is what stops the card asking about the same contact again.
 */
export function FamilyCard({ now }: { now: Date }) {
  const people = useAtlasStore((s) => s.people);
  const logPersonInteraction = useAtlasStore((s) => s.logPersonInteraction);
  const drafts = useMemo(() => buildOutreachDrafts(people, now, 2), [people, now]);
  const [error, setError] = useState<string | null>(null);

  return (
    <ContextCardShell icon={HeartHandshake} title="קשר משפחתי" iconClass="text-accent-family" href="/areas/family" cta="למשפחה">
      {drafts.length === 0 ? (
        <p className="text-sm text-muted">
          {people.length === 0 ? "עוד לא נוספו אנשי קשר." : "כולם בקשר טוב — אין למי לחזור היום."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((draft) => (
            <li key={draft.personId} className="flex flex-col gap-1.5" data-outreach={draft.personId}>
              <p className="text-sm leading-snug text-foreground/90">{draft.reason}</p>
              {/* The draft is shown, not hidden behind the button: one tap
                  sends exactly what is on screen. */}
              <p className="line-clamp-2 rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs leading-relaxed text-muted">
                {draft.message}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {draft.href ? (
                  <a
                    href={draft.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring flex items-center gap-1 rounded-lg bg-accent-health/15 px-2.5 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80"
                  >
                    <MessageCircle size={12} aria-hidden />
                    שלח בוואטסאפ
                  </a>
                ) : (
                  // No usable number: say so and point at the fix, rather than
                  // showing a button that opens a broken link.
                  <Link
                    href="/areas/family"
                    className="focus-ring rounded-lg bg-fill-subtle px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                  >
                    הוסף מספר טלפון
                  </Link>
                )}
                <button
                  onClick={() => {
                    setError(null);
                    logPersonInteraction(draft.personId).catch(() => setError("העדכון לא נשמר."));
                  }}
                  className="focus-ring flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <Check size={12} aria-hidden />
                  יצרתי קשר
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </ContextCardShell>
  );
}

/** הרהור על היום — opens Quick Capture, the app's one place a moment is written. */
export function ReflectionCard() {
  return (
    <ContextCardShell icon={NotebookPen} title="הרהור על היום" iconClass="text-accent-faith" href="/timeline" cta="לציר הזמן">
      <p className="text-sm leading-relaxed text-foreground/90">מה היה הרגע הטוב של היום, ומה היית משנה?</p>
      <button
        onClick={requestQuickCapture}
        className="focus-ring w-fit rounded-lg bg-accent-faith/15 px-3 py-1.5 text-xs font-medium text-accent-faith transition-opacity hover:opacity-80"
      >
        כתוב רגע
      </button>
    </ContextCardShell>
  );
}

/** הכרת תודה — one line, saved as a moment so it lands on the timeline with the rest. */
export function GratitudeCard() {
  const addMoment = useAtlasStore((s) => s.addMoment);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const content = text.trim();
    if (!content || saving) return;
    setSaving(true);
    setError(null);
    try {
      await addMoment({ category: "general", title: "הכרת תודה", content });
      setText("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // The words stay in the box.
      setError("לא נשמר. נסה שוב.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ContextCardShell icon={Sprout} title="הכרת תודה" iconClass="text-accent-health">
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && void save()}
        placeholder="על מה אני מודה היום…"
        aria-label="הכרת תודה"
        maxLength={280}
        className="focus-ring w-full rounded-lg bg-fill-subtle px-3 py-2 text-sm text-foreground placeholder:text-muted"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={!text.trim() || saving}
          className="focus-ring rounded-lg bg-accent-health/15 px-3 py-1.5 text-xs font-medium text-accent-health transition-opacity hover:opacity-80 disabled:opacity-40"
        >
          {saving ? "שומר…" : "שמור"}
        </button>
        {saved && (
          <span role="status" className="flex items-center gap-1 text-xs text-accent-health">
            <Check size={12} aria-hidden />
            נשמר
          </span>
        )}
        {error && <span className="text-xs text-accent-family">{error}</span>}
      </div>
    </ContextCardShell>
  );
}

const MAX_HABITS = 4;

/** הרגלים — today's habits, tickable, using the same logs the calendar's habit row does. */
export function HabitsCard({ now }: { now: Date }) {
  const habits = useAtlasStore((s) => s.habits);
  const habitLogs = useAtlasStore((s) => s.habitLogs);
  const toggleHabitCompletion = useAtlasStore((s) => s.toggleHabitCompletion);
  const [error, setError] = useState<string | null>(null);
  const todayKey = localDateKey(now);

  const doneToday = useMemo(() => {
    const done = new Set<string>();
    for (const log of habitLogs) if (log.completedDate === todayKey) done.add(log.habitId);
    return done;
  }, [habitLogs, todayKey]);

  const completed = habits.filter((h) => doneToday.has(h.id)).length;

  return (
    <ContextCardShell icon={Repeat} title="סיכום הרגלים" iconClass="text-accent-time" href="/calendar" cta="ליומן">
      {habits.length === 0 ? (
        <p className="text-xs text-muted">עוד לא הוגדרו הרגלים — אפשר להוסיף ביומן.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            {completed} מתוך {habits.length} היום
          </p>
          <ul className="flex flex-col gap-1.5">
            {habits.slice(0, MAX_HABITS).map((habit) => {
              const done = doneToday.has(habit.id);
              return (
                <li key={habit.id} className="flex min-w-0 items-center gap-2 text-sm">
                  <button
                    onClick={() => {
                      setError(null);
                      toggleHabitCompletion(habit.id, todayKey, !done).catch(() => setError("העדכון לא נשמר."));
                    }}
                    aria-pressed={done}
                    aria-label={`${habit.title} — ${done ? "בוצע" : "לא בוצע"}`}
                    className={cn(
                      "focus-ring flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      done ? "border-transparent bg-accent-health text-background" : "border-hairline-card hover:bg-accent-health/10"
                    )}
                  >
                    {done && <Check size={10} aria-hidden />}
                  </button>
                  <span className={cn("min-w-0 flex-1 truncate", done ? "text-muted line-through" : "text-foreground")}>
                    {habit.title}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </ContextCardShell>
  );
}
