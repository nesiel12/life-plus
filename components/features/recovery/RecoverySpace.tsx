"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { useReducedMotion } from "framer-motion";
import {
  Flame,
  Loader2,
  Lock,
  LifeBuoy,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { RecoverySetup, type RecoverySetupInput } from "@/components/features/recovery/RecoverySetup";
import { SupportSheet } from "@/components/features/recovery/SupportSheet";
import {
  MILESTONE_LABELS,
  formatStreak,
  milestoneProgress,
  type RecoveryEvent,
  type RecoveryProgram,
  type StreakState,
} from "@/lib/recovery/streak";

interface ProgramBundle {
  program: RecoveryProgram;
  events: RecoveryEvent[];
  streak: StreakState;
}

interface RecoverySpaceProps {
  onLock: () => Promise<void>;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * The recovery space itself, rendered only once the lock is open.
 *
 * Fetches its own data rather than reading the app store: none of this is in
 * the bootstrap payload, deliberately, so that a locked space has genuinely
 * never sent anything to the browser.
 */
export function RecoverySpace({ onLock }: RecoverySpaceProps) {
  const reduce = useReducedMotion();
  const [bundles, setBundles] = useState<ProgramBundle[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [supportFor, setSupportFor] = useState<string | null>(null);
  const [confirmingRelapse, setConfirmingRelapse] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const celebratedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const res = await fetch("/api/recovery");
    if (res.status === 423) throw new Error("locked");
    if (!res.ok) throw new Error("failed");
    const data = (await res.json()) as { programs: ProgramBundle[] };
    setBundles(data.programs);
  }, []);

  useEffect(() => {
    load()
      .catch(() => setError("לא הצלחנו לטעון את הנתונים."))
      .finally(() => setLoading(false));
  }, [load]);

  /**
   * Fires a celebration for any milestone reached but not yet marked.
   *
   * Marked server-side immediately after, so a milestone is celebrated once —
   * a refresh should not replay yesterday's confetti. Deliberately after a
   * short delay so the number on screen has painted first.
   */
  useEffect(() => {
    if (!bundles) return;
    for (const bundle of bundles) {
      const pending = bundle.streak.pendingCelebrations;
      if (pending.length === 0) continue;

      const key = `${bundle.program.id}:${pending.join(",")}`;
      if (celebratedRef.current.has(key)) continue;
      celebratedRef.current.add(key);

      if (!reduce) {
        setTimeout(() => {
          confetti({
            particleCount: 90,
            spread: 75,
            origin: { y: 0.35 },
            colors: ["#b89355", "#d9c9a3", "#ffffff"],
          });
        }, 350);
      }

      void fetch("/api/recovery", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programId: bundle.program.id,
          celebratedMilestones: [
            ...new Set([...bundle.program.celebratedMilestones, ...pending]),
          ],
        }),
      }).then(() => load().catch(() => {}));
    }
  }, [bundles, reduce, load]);

  async function createProgram(input: RecoverySetupInput) {
    const res = await fetch("/api/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "לא הצלחנו ליצור את התוכנית.");
    }
    setCreating(false);
    await load();
  }

  async function logEvent(
    programId: string,
    kind: "relapse" | "urge",
    extra: { intensity?: number; trigger?: string; note?: string } = {}
  ) {
    const res = await fetch("/api/recovery/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId, kind, ...extra }),
    });
    if (!res.ok) throw new Error("failed");
    await load();
  }

  async function removeProgram(programId: string) {
    setBusy(true);
    try {
      await fetch("/api/recovery", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // Archive, not purge: a year of recovery history should not vanish
        // behind one tap.
        body: JSON.stringify({ programId, purge: false }),
      });
      setConfirmingDelete(null);
      await load();
    } catch {
      setError("לא הצלחנו להסיר את התוכנית.");
    } finally {
      setBusy(false);
    }
  }

  const activeSupport = useMemo(
    () => bundles?.find((b) => b.program.id === supportFor) ?? null,
    [bundles, supportFor]
  );

  if (loading) {
    return (
      <GlassCard>
        <p className="flex items-center gap-2 py-4 text-sm text-muted">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          טוען…
        </p>
      </GlassCard>
    );
  }

  if (error) {
    return (
      <GlassCard className="flex flex-col items-start gap-3 py-8">
        <p className="text-sm text-foreground">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            load()
              .catch(() => setError("לא הצלחנו לטעון את הנתונים."))
              .finally(() => setLoading(false));
          }}
          className="focus-ring glass-control rounded-lg px-3 py-1.5 text-xs text-foreground"
        >
          נסה שוב
        </button>
      </GlassCard>
    );
  }

  if (creating || (bundles && bundles.length === 0)) {
    return (
      <GlassCard>
        <p className="mb-1 text-sm font-medium text-foreground">
          {bundles && bundles.length === 0 ? "בוא נתחיל" : "תוכנית חדשה"}
        </p>
        <p className="mb-6 text-xs text-muted">
          שני שדות חובה בלבד. את השאר אפשר להשלים אחר כך.
        </p>
        <RecoverySetup
          onCreate={createProgram}
          onCancel={bundles && bundles.length > 0 ? () => setCreating(false) : undefined}
        />
      </GlassCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => setCreating(true)}
          className="focus-ring glass-control flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-foreground"
        >
          <Plus size={13} aria-hidden />
          תוכנית נוספת
        </button>
        <button
          onClick={onLock}
          className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
        >
          <Lock size={13} aria-hidden />
          נעל עכשיו
        </button>
      </div>

      {bundles?.map(({ program, events, streak }) => {
        const progress = milestoneProgress(streak);
        return (
          <GlassCard key={program.id}>
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium text-foreground">{program.title}</h2>
                  <p className="mt-0.5 text-xs text-muted">
                    נקי מאז {formatDate(streak.streakStartedAt)}
                  </p>
                </div>
                <button
                  onClick={() => setConfirmingDelete(program.id)}
                  aria-label="הסר תוכנית"
                  className="focus-ring grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-red-500/12 hover:text-red-500"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </div>

              {/* The number. Everything else on this card is context for it. */}
              <div className="flex flex-col items-center gap-1.5 rounded-2xl bg-gold-soft/45 py-7">
                <span className="flex items-center gap-2 text-5xl font-semibold text-gold-ink">
                  <Flame size={30} aria-hidden />
                  {streak.currentDays}
                </span>
                <span className="text-sm text-gold-ink/85">{formatStreak(streak.currentDays)}</span>
                {streak.lastMilestone !== null && (
                  <span className="mt-1 rounded-full bg-surface/70 px-3 py-1 text-xs text-gold-ink">
                    {MILESTONE_LABELS[streak.lastMilestone] ?? `${streak.lastMilestone} ימים`}
                  </span>
                )}
              </div>

              {streak.nextMilestone !== null && progress !== null && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between text-xs text-muted">
                    <span>
                      עוד {streak.daysToNextMilestone}{" "}
                      {streak.daysToNextMilestone === 1 ? "יום" : "ימים"} ל
                      {MILESTONE_LABELS[streak.nextMilestone] ?? `${streak.nextMilestone} ימים`}
                    </span>
                    <span className="ltr tabular-nums">{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-fill-subtle">
                    <div
                      className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-500"
                      style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: "הכי הרבה", value: streak.bestDays, suffix: "ימים" },
                  { label: "דחפים שעברת", value: streak.urgesResisted, suffix: "" },
                  { label: "נפילות", value: streak.totalRelapses, suffix: "" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl border border-hairline-card bg-surface-sunken/60 py-3"
                  >
                    <p className="ltr text-lg font-medium tabular-nums text-foreground">
                      {stat.value}
                    </p>
                    <p className="text-[0.68rem] text-muted">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* The support button is the largest, warmest control here on
                  purpose: it is the one someone reaches for in the worst
                  moment, and it must be findable without reading. */}
              <button
                onClick={() => setSupportFor(program.id)}
                className="focus-ring flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3.5 text-sm font-medium text-[var(--background)] transition-opacity hover:opacity-90"
              >
                <LifeBuoy size={17} aria-hidden />
                קשה לי עכשיו
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setConfirmingRelapse(program.id)}
                  className="focus-ring flex items-center gap-1.5 rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground"
                >
                  <RotateCcw size={12} aria-hidden />
                  הייתה נפילה
                </button>
                {program.triggers.length > 0 && (
                  <span className="text-xs text-muted">
                    טריגרים: {program.triggers.slice(0, 3).join(", ")}
                  </span>
                )}
              </div>

              {confirmingRelapse === program.id && (
                <div className="flex flex-col gap-3 rounded-xl border border-hairline-card bg-surface-sunken/60 p-3.5">
                  <div>
                    <p className="text-sm font-medium text-foreground">לתעד נפילה?</p>
                    <p className="mt-1 text-xs text-muted">
                      המונה יתחיל מחדש, אבל {streak.bestDays} הימים שכבר עשית נשמרים. נפילה היא נתון,
                      לא סוף.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await logEvent(program.id, "relapse");
                          setConfirmingRelapse(null);
                        } catch {
                          setError("לא הצלחנו לשמור.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                      className="focus-ring flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-[var(--background)] disabled:opacity-50"
                    >
                      {busy && <Loader2 size={12} className="animate-spin" aria-hidden />}
                      תעד ואפס
                    </button>
                    <button
                      onClick={() => setConfirmingRelapse(null)}
                      className="focus-ring rounded-lg border border-hairline-card px-3 py-1.5 text-xs text-muted hover:text-foreground"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              )}

              {confirmingDelete === program.id && (
                <div
                  role="alertdialog"
                  aria-label="אישור הסרה"
                  className="flex flex-col gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3.5"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">להסיר את “{program.title}”?</p>
                    <p className="mt-1 text-xs text-muted">
                      התוכנית תוסתר מהמרחב. ההיסטוריה נשמרת ולא נמחקת.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmingDelete(null)}
                      disabled={busy}
                      className="focus-ring rounded-lg px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                    >
                      ביטול
                    </button>
                    <button
                      onClick={() => removeProgram(program.id)}
                      disabled={busy}
                      className="focus-ring flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-500 disabled:opacity-50"
                    >
                      {busy && <Loader2 size={12} className="animate-spin" aria-hidden />}
                      הסר
                    </button>
                  </div>
                </div>
              )}

              {events.length > 0 && (
                <details className="group">
                  <summary className="focus-ring flex cursor-pointer items-center gap-1.5 text-xs text-muted transition-colors hover:text-foreground">
                    <TrendingUp size={12} aria-hidden />
                    היסטוריה ({events.length})
                  </summary>
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {events.slice(0, 20).map((event) => (
                      <li
                        key={event.id}
                        className="flex items-center gap-2 rounded-lg border border-hairline-card px-3 py-2 text-xs"
                      >
                        {event.kind === "relapse" ? (
                          <ShieldAlert size={12} className="shrink-0 text-red-500" aria-hidden />
                        ) : (
                          <Flame size={12} className="shrink-0 text-gold-ink" aria-hidden />
                        )}
                        <span className="text-foreground/85">
                          {event.kind === "relapse" ? "נפילה" : "דחף שעבר"}
                        </span>
                        {event.trigger && <span className="text-muted">· {event.trigger}</span>}
                        {event.intensity && (
                          <span className="ltr text-muted">· עוצמה {event.intensity}</span>
                        )}
                        <span className="ltr ms-auto shrink-0 text-muted">
                          {formatDate(event.occurredAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </GlassCard>
        );
      })}

      {activeSupport && (
        <SupportSheet
          open
          program={activeSupport.program}
          streakDays={activeSupport.streak.currentDays}
          onClose={() => setSupportFor(null)}
          onLogUrge={(input) => logEvent(activeSupport.program.id, "urge", input)}
        />
      )}
    </div>
  );
}
