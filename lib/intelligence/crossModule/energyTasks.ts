import type { TaskIntensity } from "@/lib/dashboard/context";
import type { Task } from "@/types";

// Health <-> Tasks: which of the open tasks suits the energy you have right now.
//
// The circadian model (lib/health/energyCurve.ts) says how much energy there
// is; this decides what to spend it on. At a peak, the tasks that need
// concentration — study, writing, planning — are promoted; when energy is low,
// the small ones — a call, an errand, a reply — are, so a flat afternoon still
// gets something done instead of a guilt-inducing look at the hardest item.
//
// Two rules never bend, and both are tested:
//   - An overdue task is always first. Energy reorders what is *left*.
//   - An urgent task (high priority, or due today) is never pushed down for
//     being the wrong weight. Fit can promote it; it cannot demote it.
//
// Pure and clock-free: `todayKey` is a parameter, like the rest of lib/.

export type TaskDemand = "deep" | "light" | "neutral";
export type TaskFit = "match" | "neutral" | "mismatch";
export type TaskUrgency = "overdue" | "high" | "today" | "later";

// Keywords are Hebrew stems and English roots, matched as substrings of the
// title and description. A stem like "לכתוב" is one an actual task carries
// ("לכתוב את הסיכום"); the lists are deliberately short and concrete — a wrong
// guess here costs a task appearing one slot early or late, never disappearing.
const DEEP_KEYWORDS = [
  "ללמוד", "לימוד", "סוגיה", "מסכת", "שיעור", "לכתוב", "כתיבה", "לתכנן", "תכנון",
  "לחקור", "מחקר", "לנתח", "ניתוח", "לפתח", "פיתוח", "לעצב", "עיצוב", "לסכם", "סיכום",
  "פרויקט", "אפיון", "דוח", "לתכנת", "מבחן", "סמינר", "לחזור על",
  "study", "write", "design", "plan", "research", "analy", "develop", "review", "draft", "essay", "thesis",
];

const LIGHT_KEYWORDS = [
  "לקנות", "להתקשר", "לשלוח", "לשלם", "לתאם", "לסדר", "להזמין", "לאשר", "לענות",
  "להחזיר", "לקבוע", "לשאול", "להוציא", "לזרוק", "להדפיס", "לקחת", "להביא",
  "buy", "call", "email", "send", "pay", "book", "order", "print", "reply",
];

const DEEP_DESCRIPTION_MIN = 40;
const DEEP_TITLE_MIN = 50;
const LIGHT_TITLE_MAX = 24;

/**
 * How much concentration a task asks for. Keywords first (they say what the
 * task *is*), then size (a long title or a written-out description is a
 * substantial task; a two-word title with no notes is a small one).
 *
 * Priority is a separate axis on purpose: "לחתום על החוזה" is urgent and
 * light, and both are true.
 */
export function classifyTaskDemand(task: Pick<Task, "title" | "description">): TaskDemand {
  const text = `${task.title} ${task.description ?? ""}`.toLowerCase();
  if (DEEP_KEYWORDS.some((k) => text.includes(k))) return "deep";
  if (LIGHT_KEYWORDS.some((k) => text.includes(k))) return "light";

  const description = task.description?.trim() ?? "";
  if (description.length >= DEEP_DESCRIPTION_MIN || task.title.length >= DEEP_TITLE_MIN) return "deep";
  if (!description && task.title.length <= LIGHT_TITLE_MAX) return "light";
  return "neutral";
}

export function taskUrgency(task: Pick<Task, "dueDate" | "isHighPriority">, todayKey: string): TaskUrgency {
  const due = task.dueDate?.slice(0, 10);
  if (due && due < todayKey) return "overdue";
  if (task.isHighPriority) return "high";
  if (due === todayKey) return "today";
  return "later";
}

const URGENCY_RANK: Record<TaskUrgency, number> = { overdue: 0, high: 1, today: 2, later: 3 };

/** Whether a task's weight suits the energy. Only deep and light energy have a preference. */
export function taskFit(demand: TaskDemand, intensity: TaskIntensity): TaskFit {
  if (demand === "neutral") return "neutral";
  if (intensity === "deep") return demand === "deep" ? "match" : "mismatch";
  if (intensity === "light") return demand === "light" ? "match" : "mismatch";
  return "neutral";
}

const FIT_RANK: Record<TaskFit, number> = { match: 0, neutral: 1, mismatch: 2 };

export interface TaskRecommendation {
  task: Task;
  demand: TaskDemand;
  urgency: TaskUrgency;
  fit: TaskFit;
  /** A short chip for the UI, or null when there is nothing worth saying. */
  label: string | null;
}

function fitLabel(demand: TaskDemand, fit: TaskFit, intensity: TaskIntensity): string | null {
  if (fit === "match") return demand === "deep" ? "ממוקדת — מתאימה לשיא" : "קלה — מתאימה לעכשיו";
  if (fit === "mismatch" && intensity === "light" && demand === "deep") return "עדיפה בשיא";
  return null;
}

/**
 * Open tasks in the order worth showing at this energy.
 *
 * A lexicographic key, so the ordering is total by construction: overdue first;
 * then how well the task's weight fits the energy (matches, then neutral, then
 * misfits); then urgency; then the order the tasks came in. An urgent task's
 * misfit is treated as neutral — see the rules at the top.
 */
export function recommendTasks(
  tasks: readonly Task[],
  intensity: TaskIntensity,
  todayKey: string
): TaskRecommendation[] {
  return tasks
    .filter((t) => t.status !== "done")
    .map((task, index) => {
      const demand = classifyTaskDemand(task);
      const urgency = taskUrgency(task, todayKey);
      let fit = taskFit(demand, intensity);
      if (fit === "mismatch" && urgency !== "later") fit = "neutral";
      return { task, demand, urgency, fit, index };
    })
    .sort((a, b) => {
      const key = (r: typeof a) => [r.urgency === "overdue" ? 0 : 1, FIT_RANK[r.fit], URGENCY_RANK[r.urgency], r.index];
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    })
    .map(({ task, demand, urgency, fit }) => ({ task, demand, urgency, fit, label: fitLabel(demand, fit, intensity) }));
}
