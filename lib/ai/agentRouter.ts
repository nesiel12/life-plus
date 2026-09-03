import "server-only";
import { z } from "zod";
import { generateStructuredData } from "@/lib/ai";
import { resolveTaskAssist, type TaskAssist } from "@/lib/ai/agents/taskAgent";
import { formatSnapshotForPrompt, type FinancialSnapshot } from "@/lib/finances/analyze";
import type { LearningResource, LearningTopic, Task } from "@/types";

// The Section AI Router (Sprint 6): "if the user types in the main search
// bar, the correct agent answers." The main search bar is AICompanion's
// existing "chat" mode (components/layout/AICompanion.tsx) — reachable from
// every page — which already streams through app/api/chat with real context
// via buildAtlasContext (lib/context/buildAtlasContext.ts). That context
// already covers goals, life areas, upcoming events, people and calendar
// events, so a "memories" or general scheduling-adjacent question is already
// well-grounded today; routing those again would just be redundant, not a
// better answer. This router exists for the three domains buildAtlasContext
// genuinely does not cover at all — finance, tasks, study — plus calendar,
// where routing to the exact tested CalendarAgent pipeline (real conflict
// detection, real free-slot search) beats a generic streamed guess at a
// concrete scheduling request.
//
// Division of labour, same rule financeAgent states for itself: this module
// never computes a fact. Classification is the only LLM call; every number a
// grounded answer states comes from a deterministic function fed real repo
// data, exactly like FinanceAgent's snapshot or CalendarAgent's slot search.
// The chat route's own persona then narrates those facts in Hebrew — the
// part a model is actually good at.

export const ROUTER_DOMAINS = ["finance", "tasks", "study", "calendar", "general"] as const;
export type RouterDomain = (typeof ROUTER_DOMAINS)[number];

export const routerIntentSchema = z.object({
  domain: z
    .enum(ROUTER_DOMAINS)
    .describe(
      "finance: שאלה על הוצאות, הכנסות, תקציב או מצב כלכלי. " +
        "tasks: שאלה על משימות פתוחות, מה דחוף, או בקשת עזרה עם משימה ספציפית. " +
        "study: שאלה על התקדמות בלמידה או נושאי לימוד. " +
        "calendar: בקשה קונקרטית לקבוע/למצוא זמן ביומן. " +
        "general: כל דבר אחר — שיחה, תובנה אישית, כל דבר שלא נכנס לארבעת הקטגוריות הקודמות."
    ),
});

export type RouterIntent = z.infer<typeof routerIntentSchema>;

export const ROUTER_SYSTEM = [
  "אתה המסווג הפנימי של Life Plus. אתה לא עונה למשתמש — אתה רק מחליט איזה מומחה פנימי הכי מתאים לענות על ההודעה הזו.",
  "בחר תחום אחד בלבד מתוך הרשימה הסגורה שנמסרה לך בסכימה. אם ההודעה עמומה או כללית, בחר general — זו ברירת המחדל הבטוחה, לא tasks/finance/study/calendar במקרה של ספק.",
].join("\n");

export function buildRouterPrompt(message: string): string {
  return `הודעת המשתמש: ${message}`;
}

/**
 * The one LLM call this module makes. Never throws — a classification
 * failure (timeout, malformed model output, provider hiccup) degrades to
 * "general", which is exactly today's pre-Sprint-6 behavior, never a broken
 * chat turn. Classification is deliberately cheap: one short enum field, no
 * conversation history — the router only needs to know what *this* message
 * is about, not carry a second, competing notion of conversational context
 * alongside buildAtlasContext's.
 */
export async function classifyRouterDomain(message: string): Promise<RouterDomain> {
  try {
    const result = await generateStructuredData({
      schema: routerIntentSchema,
      system: ROUTER_SYSTEM,
      prompt: buildRouterPrompt(message),
    });
    return result.domain;
  } catch {
    return "general";
  }
}

/** Grounding facts injected into the chat persona's system prompt, plus what
 *  the UI's existing basedOn attribution should cite for this turn. */
export interface DomainGrounding {
  lines: string[];
  basedOn: string[];
}

// Never returns null — same honest-empty-state contract as groundTasks and
// groundStudy below: "nothing recorded yet" is itself a real fact worth
// stating (and worth citing in basedOn), not a reason to fall back to an
// ungrounded generic answer that has zero visibility into the user's
// finances either.
export function groundFinance(snapshot: FinancialSnapshot | null): DomainGrounding {
  if (!snapshot) {
    return {
      lines: ["נתוני אמת על המצב הפיננסי של המשתמש: עדיין לא נרשמו תנועות."],
      basedOn: ["תמונת מצב פיננסית — אין נתונים"],
    };
  }
  return {
    lines: [
      "נתוני אמת על המצב הפיננסי של המשתמש — אלה המספרים היחידים שמותר לך להשתמש בהם, אל תמציא או תעגל אחרת:",
      ...formatSnapshotForPrompt(snapshot),
    ],
    basedOn: [`תמונת מצב פיננסית — ${snapshot.month}`],
  };
}

const OVERDUE_LIST_LIMIT = 5;
const HIGH_PRIORITY_LIST_LIMIT = 5;

/**
 * `now` is a parameter, not `new Date()` internally — same discipline
 * findFocusSlots holds itself to (lib/calendar/findFocusSlots.ts), so this
 * stays unit-testable without mocking the clock.
 */
export function groundTasks(tasks: Task[], now: Date): DomainGrounding {
  const open = tasks.filter((t) => t.status !== "done");
  if (open.length === 0) {
    return {
      lines: ["נתוני אמת על המשימות של המשתמש: אין כרגע אף משימה פתוחה."],
      basedOn: ["רשימת המשימות — ריקה"],
    };
  }

  const todayKey = now.toISOString().slice(0, 10);
  const overdue = open
    .filter((t) => t.dueDate && t.dueDate.slice(0, 10) < todayKey)
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  const highPriority = open.filter((t) => t.isHighPriority);

  const lines = [
    "נתוני אמת על המשימות של המשתמש — אלה המשימות היחידות שמותר לך להזכיר, אל תמציא משימות אחרות:",
    `סה"כ משימות פתוחות: ${open.length}.`,
  ];

  if (overdue.length > 0) {
    lines.push(
      `משימות שעבר מועד היעד שלהן (${overdue.length}):`,
      ...overdue.slice(0, OVERDUE_LIST_LIMIT).map((t) => `- ${t.title} (יעד: ${t.dueDate!.slice(0, 10)})`)
    );
    if (overdue.length > OVERDUE_LIST_LIMIT) lines.push(`ועוד ${overdue.length - OVERDUE_LIST_LIMIT} נוספות.`);
  } else {
    lines.push("אין משימות שעבר מועד היעד שלהן.");
  }

  if (highPriority.length > 0) {
    lines.push(
      `משימות בעדיפות גבוהה (${highPriority.length}):`,
      ...highPriority.slice(0, HIGH_PRIORITY_LIST_LIMIT).map((t) => `- ${t.title}`)
    );
    if (highPriority.length > HIGH_PRIORITY_LIST_LIMIT)
      lines.push(`ועוד ${highPriority.length - HIGH_PRIORITY_LIST_LIMIT} נוספות.`);
  }

  return { lines, basedOn: [`רשימת המשימות — ${open.length} פתוחות`] };
}

/**
 * Fuzzy title match for "עזור לי עם המשימה X" asked through chat rather
 * than clicked from TaskCard directly. Deliberately simple (normalized
 * substring, either direction) — good enough to find an obvious match and
 * safe to under-match: a false negative just falls back to the task list
 * summary above, a false positive would misattribute AI help to the wrong
 * task, which is the worse failure.
 */
export function matchTaskByTitle(tasks: Task[], message: string): Task | null {
  const normalize = (s: string) => s.trim().toLowerCase();
  const needle = normalize(message);
  if (!needle) return null;
  const open = tasks.filter((t) => t.status !== "done");
  return (
    open.find((t) => {
      const title = normalize(t.title);
      return title.length > 1 && (needle.includes(title) || title.includes(needle));
    }) ?? null
  );
}

/**
 * Renders an already-resolved TaskAgent result (lib/ai/agents/taskAgent.ts)
 * as grounding lines — pure and separately testable from the LLM call that
 * produces the assist itself, same split as everywhere else in this module.
 */
export function formatTaskAssistGrounding(taskTitle: string, assist: TaskAssist): DomainGrounding {
  const lines = [`המשתמש ביקש עזרה עם המשימה הפתוחה שלו "${taskTitle}".`];

  if (assist.kind === "research") {
    if (assist.overview) lines.push(assist.overview);
    if (assist.considerations?.length) lines.push(...assist.considerations.map((c) => `- ${c}`));
  } else if (assist.kind === "draft") {
    if (assist.draftSubject) lines.push(`נושא: ${assist.draftSubject}`);
    if (assist.draftBody) lines.push("טיוטה:", assist.draftBody);
  } else if (assist.unclearReason) {
    lines.push(assist.unclearReason);
  }

  return { lines, basedOn: [`עוזר הביצוע — ${taskTitle}`] };
}

/**
 * The tasks-domain dispatch, in full: a named task ("עזור לי עם המשימה X")
 * gets real TaskAgent help through the exact same pipeline TaskCard's own
 * "עזור לי עם המשימה" button uses (Sprint 5); anything else gets the
 * deterministic task-list summary (groundTasks above) — real facts either
 * way, never a guess at what the user's tasks are.
 */
export async function groundTaskDomain(tasks: Task[], message: string, now: Date): Promise<DomainGrounding> {
  const matched = matchTaskByTitle(tasks, message);
  if (!matched) return groundTasks(tasks, now);

  try {
    const assist = await resolveTaskAssist({ title: matched.title, description: matched.description });
    return formatTaskAssistGrounding(matched.title, assist);
  } catch {
    // TaskAgent itself failed — fall back to the deterministic summary
    // rather than losing the turn entirely.
    return groundTasks(tasks, now);
  }
}

export function groundStudy(topics: LearningTopic[], resources: LearningResource[]): DomainGrounding {
  if (topics.length === 0) {
    return {
      lines: ["נתוני אמת על הלמידה של המשתמש: הוא עדיין לא הוסיף אף נושא למידה."],
      basedOn: ["מרחב הלמידה — ריק"],
    };
  }

  const lines = ["נתוני אמת על הלמידה של המשתמש — אלה הנושאים והמקורות היחידים שמותר לך להזכיר:"];
  for (const topic of topics) {
    const topicResources = resources.filter((r) => r.topicId === topic.id);
    const completed = topicResources.filter((r) => r.isCompleted).length;
    const status =
      topicResources.length === 0
        ? "בלי מקורות עדיין"
        : `${completed}/${topicResources.length} מקורות הושלמו`;
    lines.push(`- ${topic.title}${topic.category ? ` (${topic.category})` : ""}: ${status}`);
  }

  return { lines, basedOn: [`מרחב הלמידה — ${topics.length} נושאים`] };
}
