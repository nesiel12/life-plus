import { deriveFinanceAlert, type FinancialSnapshot } from "@/lib/finances/analyze";
import type { Goal, Person, Task } from "@/types";

// The Decision Stream (LifeOS Pillar 3).
//
// The brief is "ZERO cognitive overload — show only the top 3 actionable
// items requiring immediate approval", and the hard part of that is not the
// rendering, it's the ranking. A list that surfaces the wrong three is worse
// than a list of ten, because the user stops trusting it and goes back to
// scanning everything.
//
// So: every candidate is a real, already-true fact drawn from data the app
// holds (an overdue task, a negative month, a contact genuinely past the
// user's own check-in interval), scored deterministically. No LLM decides
// what matters — same rule the rest of this codebase holds to, and doubly
// important here, because this list is explicitly the thing the user is
// meant to act on without re-checking.
//
// Scoring is a flat integer priority rather than a weighted formula. With
// this few signal types a formula would be false precision: what actually
// matters is the ordering between categories, and stating that as explicit
// tiers makes it reviewable instead of emergent.

export type DecisionKind = "overdue-task" | "finance" | "priority-task" | "stale-contact" | "stalled-goal";

export interface Decision {
  id: string;
  kind: DecisionKind;
  title: string;
  detail: string;
  /** Higher surfaces first. */
  score: number;
  /** Where acting on this actually happens. */
  href: string;
}

// Tier boundaries, most to least urgent. A thing that is already late beats
// a thing that is merely important; money beats both when it's genuinely
// negative, because it's the least recoverable.
const TIER = {
  overdueTask: 1000,
  finance: 900,
  priorityTask: 700,
  staleContact: 500,
  stalledGoal: 300,
} as const;

export const DECISION_STREAM_LIMIT = 3;

function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

export interface DecisionInputs {
  tasks: Task[];
  goals: Goal[];
  people: Person[];
  snapshot: FinancialSnapshot | null;
  /** The user's own check-in interval, same value the family page uses. */
  staleThresholdDays: number;
  now: Date;
}

/**
 * Builds the ranked candidate list. Returns everything it found, ordered —
 * capping to three is the caller's job, so a "show all" view can reuse this
 * without a second, divergent ranking.
 */
export function buildDecisionStream({
  tasks,
  goals,
  people,
  snapshot,
  staleThresholdDays,
  now,
}: DecisionInputs): Decision[] {
  const decisions: Decision[] = [];
  const open = tasks.filter((t) => t.status !== "done");

  // 1. Overdue tasks — already late, so the most overdue leads.
  for (const task of open) {
    if (!task.dueDate) continue;
    const overdueBy = daysBetween(new Date(task.dueDate), now);
    if (overdueBy <= 0) continue;
    decisions.push({
      id: `overdue-${task.id}`,
      kind: "overdue-task",
      title: task.title,
      detail: overdueBy === 1 ? "באיחור של יום" : `באיחור של ${overdueBy} ימים`,
      // Deeper overdue ranks higher, but never escapes its tier.
      score: TIER.overdueTask + Math.min(overdueBy, 99),
      href: "/calendar",
    });
  }

  // 2. Finance — reuses the exact alert the dashboard card shows, so the two
  // can never disagree about whether this month is a problem.
  const alert = deriveFinanceAlert(snapshot);
  if (alert) {
    decisions.push({
      id: `finance-${alert.kind}`,
      kind: "finance",
      title: alert.kind === "overspent" ? "החודש בגירעון" : "הוצאות חריגות החודש",
      detail: alert.message,
      score: TIER.finance,
      href: "/areas/finances",
    });
  }

  // 3. High-priority tasks that aren't already counted as overdue above.
  for (const task of open) {
    if (!task.isHighPriority) continue;
    const overdue = task.dueDate && daysBetween(new Date(task.dueDate), now) > 0;
    if (overdue) continue;
    decisions.push({
      id: `priority-${task.id}`,
      kind: "priority-task",
      title: task.title,
      detail: "מסומנת בעדיפות גבוהה",
      score: TIER.priorityTask,
      href: "/calendar",
    });
  }

  // 4. Contacts past the user's own check-in interval.
  for (const person of people) {
    if (!person.lastMeaningfulInteraction) continue;
    const since = daysBetween(new Date(person.lastMeaningfulInteraction), now);
    if (since < staleThresholdDays) continue;
    decisions.push({
      id: `stale-${person.id}`,
      kind: "stale-contact",
      title: person.hebrewName ?? person.name,
      detail: `לא דיברתם כבר ${since} ימים`,
      score: TIER.staleContact + Math.min(since, 99),
      href: "/areas/family",
    });
  }

  // 5. Goals with milestones where none are done — started on paper only.
  for (const goal of goals) {
    if (goal.milestones.length === 0) continue;
    if (goal.milestones.some((m) => m.done)) continue;
    decisions.push({
      id: `goal-${goal.id}`,
      kind: "stalled-goal",
      title: goal.title,
      detail: "אף אבן דרך לא הושלמה עדיין",
      score: TIER.stalledGoal,
      href: "/",
    });
  }

  // Stable tiebreak on id so equal-scored items don't reshuffle between
  // renders — a list that reorders itself under the cursor is unusable.
  return decisions.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** The top N, for the dashboard's deliberately-short view. */
export function topDecisions(inputs: DecisionInputs, limit = DECISION_STREAM_LIMIT): Decision[] {
  return buildDecisionStream(inputs).slice(0, limit);
}
