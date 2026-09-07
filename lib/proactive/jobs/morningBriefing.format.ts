// Pure shaping and phrasing for the morning briefing.
//
// Separated from the job so the interesting decisions — what counts as
// "today", how a day with nothing on it reads, what the deterministic
// fallback says when no AI provider is configured — are testable without a
// database, an LLM, or a clock.
//
// Deliberately not reusing lib/time/buildDailyTimeline.ts: that function
// buckets by `new Date(iso).getHours()`, i.e. the *runtime's* timezone. In
// the browser that is the user's timezone and correct. In a cron job it is
// the server's, which is usually UTC — so a 09:00 Jerusalem meeting would be
// filed at 06:00 and a late-evening event would land on the wrong day.

export interface BriefingEvent {
  title: string;
  /** ISO instant, or "YYYY-MM-DD" for an all-day event. */
  start: string;
  isAllDay: boolean;
}

export interface BriefingTask {
  title: string;
  dueDate?: string;
  isHighPriority: boolean;
}

export interface BriefingInput {
  /** "YYYY-MM-DD" in the user's own timezone. */
  today: string;
  timeZone: string;
  greetingName?: string;
  events: BriefingEvent[];
  tasks: BriefingTask[];
  /** The single most relevant relationship nudge, already phrased. */
  relationshipNudge?: string;
  /** The top-ranked Intelligence Engine signal, already phrased. */
  topSignal?: string;
  /** Today's intention, if the user has already set one. */
  intention?: string;
}

export interface BriefingParts {
  timedEvents: BriefingEvent[];
  allDayEvents: BriefingEvent[];
  focusTasks: BriefingTask[];
  relationshipNudge?: string;
  topSignal?: string;
  intention?: string;
  isEmptyDay: boolean;
}

/** How many tasks the briefing will name. More than this is a list, not a brief. */
const MAX_TASKS = 3;

function localDay(iso: string, timeZone: string): string {
  if (!iso.includes("T")) return iso.slice(0, 10); // already a bare local date
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);
}

export function formatLocalTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatHebrewDate(day: string, timeZone: string): string {
  // Noon, so the date cannot slip either way when re-read in another zone.
  const date = new Date(`${day}T12:00:00Z`);
  return date.toLocaleDateString("he-IL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Narrows the day's raw material down to what a briefing should mention. */
export function selectBriefingParts(input: BriefingInput): BriefingParts {
  const todays = input.events.filter((e) => localDay(e.start, input.timeZone) === input.today);

  const timedEvents = todays
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.start.localeCompare(b.start));
  const allDayEvents = todays.filter((e) => e.isAllDay);

  // High-priority first, then anything due today. A task with no due date and
  // no priority flag is not what someone needs to hear about at 07:00.
  const dueToday = input.tasks.filter(
    (t) => t.dueDate && localDay(t.dueDate, input.timeZone) === input.today
  );
  const focusTasks = [
    ...input.tasks.filter((t) => t.isHighPriority && !dueToday.includes(t)),
    ...dueToday,
  ].slice(0, MAX_TASKS);

  return {
    timedEvents,
    allDayEvents,
    focusTasks,
    relationshipNudge: input.relationshipNudge,
    topSignal: input.topSignal,
    intention: input.intention,
    isEmptyDay:
      timedEvents.length === 0 &&
      allDayEvents.length === 0 &&
      focusTasks.length === 0 &&
      !input.relationshipNudge,
  };
}

/** The structured facts handed to the model. Never free prose. */
export function formatBriefingInput(parts: BriefingParts, input: BriefingInput): string {
  const lines: string[] = [`התאריך: ${formatHebrewDate(input.today, input.timeZone)}`];

  if (input.greetingName) lines.push(`שם: ${input.greetingName}`);

  if (parts.allDayEvents.length > 0) {
    lines.push(`כל היום: ${parts.allDayEvents.map((e) => e.title).join(", ")}`);
  }

  if (parts.timedEvents.length > 0) {
    lines.push("ביומן היום:");
    for (const event of parts.timedEvents) {
      lines.push(`- ${formatLocalTime(event.start, input.timeZone)} ${event.title}`);
    }
  } else {
    lines.push("ביומן היום: אין אירועים מתוזמנים.");
  }

  if (parts.focusTasks.length > 0) {
    lines.push("משימות מרכזיות:");
    for (const task of parts.focusTasks) {
      lines.push(`- ${task.title}${task.isHighPriority ? " (עדיפות גבוהה)" : ""}`);
    }
  }

  if (parts.relationshipNudge) lines.push(`קשרים: ${parts.relationshipNudge}`);
  if (parts.topSignal) lines.push(`הכי בולט כרגע: ${parts.topSignal}`);
  lines.push(
    parts.intention ? `הכוונה שהוגדרה להיום: ${parts.intention}` : "עדיין לא הוגדרה כוונה להיום."
  );

  return lines.join("\n");
}

/**
 * The briefing without an LLM.
 *
 * Not a degraded placeholder — it is the same facts, plainly stated. A user
 * with no AI provider configured, or one whose provider is down at 07:00,
 * still gets a real, useful briefing rather than silence.
 */
export function deterministicBriefing(parts: BriefingParts, input: BriefingInput): string {
  const hello = input.greetingName ? `בוקר טוב, ${input.greetingName}.` : "בוקר טוב.";

  if (parts.isEmptyDay) {
    return [
      hello,
      "היומן שלך פנוי היום ואין משימות דחופות — יום שאפשר להחליט מה לעשות בו.",
      parts.intention ? `הכוונה שלך להיום: ${parts.intention}` : "מה הכוונה שלך להיום?",
    ].join(" ");
  }

  const sentences: string[] = [hello];

  if (parts.allDayEvents.length > 0) {
    sentences.push(`היום: ${parts.allDayEvents.map((e) => e.title).join(", ")}.`);
  }

  if (parts.timedEvents.length > 0) {
    const listed = parts.timedEvents
      .slice(0, 4)
      .map((e) => `${formatLocalTime(e.start, input.timeZone)} ${e.title}`)
      .join(", ");
    const extra = parts.timedEvents.length > 4 ? ` ועוד ${parts.timedEvents.length - 4}` : "";
    sentences.push(`ביומן: ${listed}${extra}.`);
  } else {
    sentences.push("אין לך אירועים ביומן היום.");
  }

  if (parts.focusTasks.length > 0) {
    sentences.push(`מה שכדאי לקדם: ${parts.focusTasks.map((t) => t.title).join(", ")}.`);
  }

  if (parts.relationshipNudge) sentences.push(`${parts.relationshipNudge}.`);

  sentences.push(
    parts.intention ? `הכוונה שלך להיום: ${parts.intention}` : "מה הכוונה שלך להיום?"
  );

  return sentences.join(" ");
}

/** The "על סמך…" attribution, naming only sources that actually contributed. */
export function briefingReason(parts: BriefingParts, calendarConnected: boolean): string {
  const sources: string[] = [];
  if (calendarConnected) sources.push("היומן שלך");
  if (parts.focusTasks.length > 0) sources.push("המשימות הפתוחות");
  if (parts.relationshipNudge) sources.push("אנשי הקשר");
  if (sources.length === 0) return "על סמך מה שמוגדר לך באפליקציה להיום";
  return `על סמך ${sources.join(", ")}`;
}
