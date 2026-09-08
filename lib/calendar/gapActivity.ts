// Turning a genuinely free stretch into something worth showing on the line.
//
// By the time a gap reaches here it is already free of calendar events *and*
// of the busy routine (see lib/calendar/dayGaps.ts). So the only routine
// blocks that can still cover it are "free" / "rest" ones — time the user
// deliberately protected — and those get their own label. Everything else is
// plain open time, optionally carrying one pressing task.

import { blocksForDay, type RoutineBlock } from "@/lib/schedule/routine";
import type { DayGap } from "@/lib/calendar/dayGaps";

export interface GapTaskCandidate {
  id: string;
  title: string;
  status: string;
  /** ISO date or datetime. */
  dueDate?: string;
  isHighPriority?: boolean;
}

export interface GapActivity {
  /** Short Hebrew label for the line, e.g. "זמן פנוי" or "מנוחה". */
  label: string;
  /** Accent token when a protected block covers the gap. */
  accentVar?: string;
  /** A pressing task that fits, offered with a "schedule here" action. */
  task?: GapTaskCandidate;
}

const MIN_TASK_GAP_MINUTES = 30;

/**
 * The one task worth surfacing for a gap: overdue first, then due today, then
 * pinned. Never just any open task — a free hour filled with unranked
 * busywork is how the whole affordance gets ignored.
 */
export function pickGapTask(
  candidates: GapTaskCandidate[],
  gapDurationMinutes: number,
  todayKey: string
): GapTaskCandidate | null {
  if (gapDurationMinutes < MIN_TASK_GAP_MINUTES) return null;

  const scored = candidates
    .filter((t) => t.status !== "done")
    .map((t) => {
      const due = t.dueDate ? t.dueDate.slice(0, 10) : null;
      let score = 0;
      if (due && due < todayKey) score += 100; // overdue
      else if (due === todayKey) score += 50; // due today
      if (t.isHighPriority) score += 25;
      return { task: t, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.task ?? null;
}

export function resolveGapActivity(
  gap: DayGap,
  context: {
    blocks: RoutineBlock[];
    weekday: number;
    tasks: GapTaskCandidate[];
    todayKey: string;
  }
): GapActivity {
  const midpoint = (gap.startMinute + gap.endMinute) / 2;
  const covering = blocksForDay(context.blocks, context.weekday).find(
    (b) =>
      (b.kind === "rest" || b.kind === "free") &&
      b.startMinute <= midpoint &&
      b.endMinute > midpoint
  );

  if (covering?.kind === "rest") {
    return { label: covering.title || "מנוחה", accentVar: "--accent-time" };
  }

  const task = pickGapTask(context.tasks, gap.durationMinutes, context.todayKey) ?? undefined;

  if (covering?.kind === "free") {
    return { label: covering.title || "זמן פנוי מתוכנן", accentVar: "--gold", task };
  }

  return { label: "זמן פנוי", task };
}
