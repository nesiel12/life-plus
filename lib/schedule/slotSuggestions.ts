import {
  formatMinute,
  freeWindows,
  type RoutineBlock,
} from "@/lib/schedule/routine";

// Matching work that needs doing to time that is actually free.
//
// Pure, so the ranking rules are testable: which task, into which window, and
// — the part that matters — when to say nothing at all. A suggestion engine
// that always produces a suggestion is a random number generator with a
// confident tone.

export interface SchedulableTask {
  id: string;
  title: string;
  isHighPriority: boolean;
  /** ISO instant, when it has one. */
  dueDate?: string;
  status: string;
}

export interface SlotSuggestion {
  task: SchedulableTask;
  startMinute: number;
  endMinute: number;
  /** Why this slot: peak-energy hours, or simply the next free stretch. */
  reason: string;
}

/** Nothing shorter than this is worth proposing as a working block. */
const MIN_SLOT_MINUTES = 45;

/** The most any one task gets proposed for in a single sitting. */
const MAX_SLOT_MINUTES = 90;

/**
 * Which tasks are worth scheduling, most urgent first.
 *
 * Deliberately narrow: overdue, due today, or explicitly flagged. A task with
 * no due date and no priority is not something the app should be pushing
 * someone to do at 3pm — it is something they chose not to schedule.
 */
export function rankSchedulable(
  tasks: SchedulableTask[],
  at: Date,
  todayKey: string
): SchedulableTask[] {
  const open = tasks.filter((t) => t.status !== "done");

  const scored = open
    .map((task) => {
      const due = task.dueDate ? new Date(task.dueDate).getTime() : null;
      const isOverdue = due !== null && due < at.getTime();
      const isDueToday = task.dueDate ? task.dueDate.slice(0, 10) === todayKey : false;

      if (!isOverdue && !isDueToday && !task.isHighPriority) return null;

      // Overdue outranks due-today outranks flagged. Within a tier, the older
      // due date wins.
      const tier = isOverdue ? 0 : isDueToday ? 1 : 2;
      return { task, tier, due: due ?? Number.MAX_SAFE_INTEGER };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return scored.sort((a, b) => a.tier - b.tier || a.due - b.due).map((s) => s.task);
}

/**
 * Proposes a time for the most pressing tasks in today's remaining gaps.
 *
 * Peak-focus hours are preferred where they overlap a free window, because
 * that is the difference between scheduling deep work well and merely
 * scheduling it. Returns an empty list when there is nothing pressing or
 * nowhere to put it — silence is a valid and frequent answer.
 */
export function suggestSlots(
  tasks: SchedulableTask[],
  blocks: RoutineBlock[],
  options: {
    at: Date;
    weekday: number;
    nowMinute: number;
    todayKey: string;
    /** Local hours the user focuses best in, from their chronotype. */
    peakHours?: number[];
    /** Latest hour worth proposing work in. */
    endOfDayHour?: number;
    limit?: number;
  }
): SlotSuggestion[] {
  const candidates = rankSchedulable(tasks, options.at, options.todayKey);
  if (candidates.length === 0) return [];

  const windows = freeWindows(blocks, options.weekday, {
    // Rounded up to the next quarter hour: proposing "start at 14:07" is
    // technically accurate and practically ignored.
    fromMinute: Math.ceil(options.nowMinute / 15) * 15,
    toMinute: (options.endOfDayHour ?? 22) * 60,
    minDurationMinutes: MIN_SLOT_MINUTES,
  });
  if (windows.length === 0) return [];

  const peak = new Set(options.peakHours ?? []);
  const suggestions: SlotSuggestion[] = [];
  const remaining = [...windows];

  for (const task of candidates.slice(0, options.limit ?? 2)) {
    // Prefer a window that starts in a peak hour, else the earliest one.
    const peakIndex = remaining.findIndex((w) => peak.has(Math.floor(w.startMinute / 60)));
    const index = peakIndex >= 0 ? peakIndex : 0;
    const window = remaining[index];
    if (!window) break;

    const duration = Math.min(window.durationMinutes, MAX_SLOT_MINUTES);
    const endMinute = window.startMinute + duration;

    suggestions.push({
      task,
      startMinute: window.startMinute,
      endMinute,
      reason:
        peakIndex >= 0
          ? "בשעות המיקוד שלך"
          : `החלון הפנוי הקרוב · ${formatMinute(window.startMinute)}`,
    });

    // Consume the used part; keep the tail if enough of it is left for
    // another task.
    const leftover = window.durationMinutes - duration;
    if (leftover >= MIN_SLOT_MINUTES) {
      remaining[index] = {
        startMinute: endMinute,
        endMinute: window.endMinute,
        durationMinutes: leftover,
      };
    } else {
      remaining.splice(index, 1);
    }
  }

  return suggestions;
}
