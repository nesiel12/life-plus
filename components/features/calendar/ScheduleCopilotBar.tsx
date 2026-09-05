"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, Check, Loader2, Sparkles, Zap } from "lucide-react";
import { useAtlasStore } from "@/store/useAtlasStore";
import { findFocusSlotsAcrossDays, type FocusSlot, type Interval } from "@/lib/calendar/findFocusSlots";
import { cn } from "@/lib/utils";

interface ScheduleCopilotBarProps {
  busy: (Interval & { title?: string })[];
  onScheduled?: () => void;
}

const HORIZON_DAYS = 3;
const MAX_SUGGESTIONS = 3;

function formatSlot(slot: FocusSlot): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const day = start.toLocaleDateString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" });
  const from = start.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const to = end.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${from}–${to}`;
}

// The Schedule Copilot: proactive placement suggestions, inside the calendar.
//
// It pairs each unscheduled high-priority task with a real free window from
// findFocusSlotsAcrossDays, which is pure, tested and ranks by the user's own
// energy curve. No AI call is involved and none should be — "which hours are
// free and which are your peak" is arithmetic over data already on the
// client, and a model asked the same question invents overlaps.
//
// That also makes it genuinely instant, which matters for a bar that renders
// with the calendar rather than arriving after it.
export function ScheduleCopilotBar({ busy, onScheduled }: ScheduleCopilotBarProps) {
  const tasks = useAtlasStore((s) => s.tasks);
  const chronotype = useAtlasStore((s) => s.personalDNA.chronotype);

  const [creating, setCreating] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Pair the most pressing unscheduled work with the best free windows.
  const pairs = useMemo(() => {
    const candidates = tasks
      .filter((t) => t.status !== "done" && !done.has(t.id))
      .sort((a, b) => {
        if (a.isHighPriority !== b.isHighPriority) return a.isHighPriority ? -1 : 1;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, MAX_SUGGESTIONS);

    const now = new Date();
    const until = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    const slots = findFocusSlotsAcrossDays({
      from: now,
      until,
      busy,
      chronotype,
      minDurationMinutes: 30,
      maxResults: MAX_SUGGESTIONS,
    });

    // One slot per task, so two suggestions never propose the same window.
    return candidates
      .map((task, i) => ({ task, slot: slots[i] }))
      .filter((pair): pair is { task: (typeof candidates)[number]; slot: FocusSlot } => Boolean(pair.slot));
  }, [tasks, busy, chronotype, done]);

  async function schedule(taskId: string, title: string, slot: FocusSlot) {
    setCreating(taskId);
    setError(null);
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, start: slot.start, end: slot.end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "לא הצלחנו לקבוע את הזמן.");
        return;
      }
      setDone((prev) => new Set(prev).add(taskId));
      onScheduled?.();
    } catch {
      setError("לא הצלחנו להגיע ליומן.");
    } finally {
      setCreating(null);
    }
  }

  // Nothing worth suggesting is a real state, not an empty shell.
  if (pairs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Sparkles size={15} className="text-gold-ink" aria-hidden />
        הצעות מיקום מה-Copilot
      </p>

      <div className="flex flex-wrap gap-2">
        {pairs.map(({ task, slot }) => (
          <div
            key={task.id}
            className="glass-control flex min-w-0 items-center gap-2.5 rounded-xl px-3 py-2"
          >
            {slot.energy === "peak" && (
              <Zap size={12} className="shrink-0 text-gold-ink" aria-label="שעת שיא" />
            )}
            <span className="min-w-0 max-w-[14rem] truncate text-xs text-foreground">{task.title}</span>
            <span className="ltr shrink-0 whitespace-nowrap text-xs text-muted">{formatSlot(slot)}</span>
            <button
              onClick={() => schedule(task.id, task.title, slot)}
              disabled={creating !== null}
              aria-label={`קבע את ${task.title} ל-${formatSlot(slot)}`}
              className={cn(
                "focus-ring grid size-6 shrink-0 place-items-center rounded-lg text-accent-time transition-colors hover:bg-fill-subtle",
                creating === task.id && "opacity-60"
              )}
            >
              {creating === task.id ? (
                <Loader2 size={12} className="animate-spin" aria-hidden />
              ) : (
                <CalendarPlus size={12} aria-hidden />
              )}
            </button>
          </div>
        ))}
      </div>

      {done.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-accent-health">
          <Check size={12} aria-hidden />
          נקבעו {done.size} זמנים ביומן.
        </p>
      )}
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}
