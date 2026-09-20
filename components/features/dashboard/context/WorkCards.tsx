"use client";

import { useMemo, useState } from "react";
import { Check, Focus, ListTodo } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { FocusModeHost } from "@/components/features/focus/FocusMode";
import { intensityHint, type EnergyGuidance } from "@/lib/dashboard/context";
import { recommendTasks } from "@/lib/intelligence/crossModule/energyTasks";
import { localDateKey } from "@/lib/dashboard/contextData";
import { ContextCardShell } from "@/components/features/dashboard/context/ContextCardShell";
import { cn } from "@/lib/utils";

const MAX_TASKS = 3;

// The engine's Health <-> Tasks rule (lib/intelligence/crossModule/energyTasks.ts):
// overdue first, then the tasks whose weight suits this energy.
function useRecommendedTasks(energy: EnergyGuidance, now: Date) {
  const tasks = useAtlasStore((s) => s.tasks);
  const todayKey = localDateKey(now);
  return useMemo(() => recommendTasks(tasks, energy.intensity, todayKey), [tasks, energy.intensity, todayKey]);
}

/**
 * משימות בעדיפות — the open tasks worth doing now, ordered for the energy the
 * circadian model says you have: study and writing promoted at a peak, quick
 * errands when it is low. Overdue always leads, and an urgent task is never
 * demoted for being the wrong weight.
 */
export function PriorityTasksCard({ energy, now }: { energy: EnergyGuidance; now: Date }) {
  const ranked = useRecommendedTasks(energy, now);
  const updateTask = useAtlasStore((s) => s.updateTask);
  const [error, setError] = useState<string | null>(null);
  const todayKey = localDateKey(now);

  return (
    <ContextCardShell icon={ListTodo} title="משימות בעדיפות" iconClass="text-accent-time" href="/calendar" cta="לכל המשימות">
      <p className="text-xs leading-relaxed text-muted">{intensityHint(energy)}</p>
      {ranked.length === 0 ? (
        <p className="text-sm text-muted">אין משימות פתוחות. כל הכבוד.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ranked.slice(0, MAX_TASKS).map(({ task, label }) => {
            const overdue = Boolean(task.dueDate && task.dueDate.slice(0, 10) < todayKey);
            return (
              <li key={task.id} className="flex min-w-0 items-center gap-2 text-sm">
                <button
                  onClick={() => {
                    setError(null);
                    updateTask(task.id, { status: "done" }).catch(() => setError("העדכון לא נשמר."));
                  }}
                  aria-label={`סמן כבוצע: ${task.title}`}
                  className="focus-ring group flex size-4 shrink-0 items-center justify-center rounded border border-hairline-card text-accent-health transition-colors hover:bg-accent-health/10"
                >
                  <Check size={10} className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
                </button>
                <span className="min-w-0 flex-1 truncate text-foreground">{task.title}</span>
                {overdue && <span className="shrink-0 rounded bg-accent-family/15 px-1.5 py-0.5 text-[0.65rem] text-accent-family">באיחור</span>}
                {!overdue && task.isHighPriority && (
                  <span className="shrink-0 rounded bg-accent-fitness/15 px-1.5 py-0.5 text-[0.65rem] text-accent-fitness">דחוף</span>
                )}
                {label && (
                  <span
                    data-fit-label
                    className="hidden shrink-0 rounded bg-accent-knowledge/12 px-1.5 py-0.5 text-[0.65rem] text-accent-knowledge sm:inline"
                  >
                    {label}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </ContextCardShell>
  );
}

/**
 * טיימר מיקוד — starts the existing deep-work overlay on the top task for this
 * energy. The overlay owns the timer; this only picks what to focus on.
 */
export function FocusCard({ energy, now }: { energy: EnergyGuidance; now: Date }) {
  const ranked = useRecommendedTasks(energy, now);
  const [open, setOpen] = useState(false);
  const target = ranked[0]?.task ?? null;
  const canFocus = energy.intensity !== "rest";

  return (
    <ContextCardShell icon={Focus} title="טיימר מיקוד" iconClass="text-accent-knowledge">
      <p className="min-w-0 text-sm text-foreground/90">
        {target ? (
          <>
            להתרכז ב<span className="font-medium text-foreground">{target.title}</span>
          </>
        ) : (
          "אפשר להתרכז גם בלי משימה מוגדרת."
        )}
      </p>
      <button
        onClick={() => setOpen(true)}
        disabled={!canFocus}
        className={cn(
          "focus-ring flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-40",
          energy.intensity === "deep" ? "bg-accent-knowledge/20 text-accent-knowledge" : "bg-fill-subtle text-foreground"
        )}
      >
        <Focus size={12} aria-hidden />
        התחל מיקוד
      </button>
      {energy.intensity === "deep" && <p className="text-xs text-muted">חלון שיא פתוח — זה הזמן.</p>}
      {energy.intensity === "light" && <p className="text-xs text-muted">אנרגיה נמוכה — אפשר גם מיקוד קצר וקל.</p>}
      <FocusModeHost task={target} open={open} onClose={() => setOpen(false)} />
    </ContextCardShell>
  );
}
