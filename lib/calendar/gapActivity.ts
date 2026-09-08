// Turning an empty stretch on the calendar into something worth showing.
//
// Two independent signals, in priority order:
//   1. A routine block the user themselves defined for that time ("this is my
//      rest window", "this is study time"). That is their stated intent and
//      outranks anything the app would guess.
//   2. A task that is actually pressing — overdue, due today, or pinned. Not
//      just any open task: filling a free hour with busywork the user did not
//      ask to be reminded of is how a helpful surface becomes an ignored one.
//
// Pure: the day view resolves store data and the weekday, this decides what
// the gap should say.

import { blocksForDay, ROUTINE_KIND_LABELS, type RoutineBlock } from "@/lib/schedule/routine";
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
  /** Short Hebrew label for the band, e.g. "זמן פנוי" or "מנוחה". */
  label: string;
  /** The routine kind's accent token, when a block covers the gap. */
  accentVar?: string;
  /** A pressing task that fits, when there is one and no routine block claims the time. */
  task?: GapTaskCandidate;
}

const MIN_TASK_GAP_MINUTES = 30;

function pickGapTask(
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
    (b) => b.startMinute <= midpoint && b.endMinute > midpoint
  );

  // A named rest/free block is the whole story — do not also push a task into
  // time the user deliberately protected.
  if (covering && (covering.kind === "rest" || covering.kind === "free")) {
    return {
      label: covering.title || ROUTINE_KIND_LABELS[covering.kind],
      accentVar: covering.kind === "rest" ? "--accent-time" : "--gold",
    };
  }

  const task = pickGapTask(context.tasks, gap.durationMinutes, context.todayKey);

  if (covering) {
    return {
      label: covering.title || ROUTINE_KIND_LABELS[covering.kind],
      accentVar: undefined,
      task: task ?? undefined,
    };
  }

  return { label: "זמן פנוי", task: task ?? undefined };
}
