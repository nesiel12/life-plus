// Local Hebrew event parser — the calendar's last line of defence.
//
// When every model in the failover chain is down, "מחר פגישה ב-13:00" should
// still become an event. This is a deterministic regex parser for the common
// shapes a person actually types, and it exists precisely because an AI
// outage should not mean the user cannot put something in their calendar.
//
// It is deliberately narrow. It returns null rather than guessing whenever
// it cannot find a real time, because a silently wrong calendar entry is
// worse than an honest "I didn't understand that" — the user would only
// discover the error by missing the thing.

export interface ParsedEvent {
  title: string;
  /** Local wall clock, "YYYY-MM-DDTHH:MM" — the shape parseLocalDateTime takes. */
  start: string;
  durationMinutes: number;
}

const DEFAULT_DURATION_MINUTES = 60;

// Sunday-first, matching Date.getDay().
const WEEKDAYS: { names: string[]; index: number }[] = [
  { names: ["ראשון"], index: 0 },
  { names: ["שני"], index: 1 },
  { names: ["שלישי"], index: 2 },
  { names: ["רביעי"], index: 3 },
  { names: ["חמישי"], index: 4 },
  { names: ["שישי"], index: 5 },
  { names: ["שבת"], index: 6 },
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function wallClock(date: Date, hour: number, minute: number): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

interface TimeMatch {
  hour: number;
  minute: number;
  /** The exact substring matched, so the title builder can remove it. */
  matched: string;
}

/**
 * Finds an explicit clock time. Requires either a colon ("13:00") or an
 * explicit hour marker ("ב-13", "בשעה 3") — a bare number is far more often
 * a date, a duration or a quantity than an hour, and guessing there is how
 * you end up with an event at 03:00.
 */
function findTime(text: string): TimeMatch | null {
  // "13:00", "ב13:00", "ב-9:30"
  const colon = /(?:^|\s|ב-?|בשעה\s*)(\d{1,2}):(\d{2})/.exec(text);
  if (colon) {
    const hour = Number(colon[1]);
    const minute = Number(colon[2]);
    if (hour <= 23 && minute <= 59) return { hour, minute, matched: colon[0] };
  }

  // "ב-13", "בשעה 3", optionally with a part-of-day qualifier after it.
  const marked = /(?:ב-|בשעה\s*)(\d{1,2})(?!\d|:)/.exec(text);
  if (marked) {
    let hour = Number(marked[1]);
    if (hour > 23) return null;
    // "ב-3 אחה״צ" / "בערב" -> afternoon/evening reading of a small number.
    const after = text.slice(marked.index + marked[0].length);
    if (/^\s*(אחה"צ|אחה״צ|אחרי הצהריים|בצהריים|בערב|בלילה)/.test(after) && hour < 12) {
      hour += 12;
    }
    return { hour, minute: 0, matched: marked[0] };
  }

  return null;
}

interface DateMatch {
  date: Date;
  matched: string;
}

/** Resolves the relative-date vocabulary people actually use. */
function findDate(text: string, now: Date): DateMatch {
  if (/מחרתיים/.test(text)) return { date: addDays(now, 2), matched: "מחרתיים" };
  if (/מחר/.test(text)) return { date: addDays(now, 1), matched: "מחר" };
  if (/היום/.test(text)) return { date: new Date(now), matched: "היום" };

  // "ביום שלישי" / "יום שלישי הבא" -> the next occurrence of that weekday.
  const weekday = /(?:ביום|יום)\s+(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/.exec(text);
  if (weekday) {
    const target = WEEKDAYS.find((w) => w.names.includes(weekday[1]));
    if (target) {
      const current = now.getDay();
      // Always strictly in the future: "ביום שלישי" said on a Tuesday means
      // next Tuesday, not five minutes ago.
      let delta = (target.index - current + 7) % 7;
      if (delta === 0) delta = 7;
      return { date: addDays(now, delta), matched: weekday[0] };
    }
  }

  // No date said at all — today is the honest default, and the time check in
  // the caller is what stops this becoming a guess.
  return { date: new Date(now), matched: "" };
}

// Matched as whole tokens, not with \b: JavaScript word boundaries are
// defined against ASCII \w, so /\bקבע\b/ never matches around Hebrew
// letters at all. Token filtering is both correct here and easier to read.
const NOISE_WORDS = new Set(["קבע", "תקבע", "תוסיף", "הוסף", "ליומן", "בבקשה", "לי", "את"]);

function buildTitle(text: string, dateMatched: string, timeMatched: string): string {
  let title = text;
  if (dateMatched) title = title.replace(dateMatched, " ");
  if (timeMatched) title = title.replace(timeMatched, " ");
  title = title
    .split(/\s+/)
    .filter((word) => word && !NOISE_WORDS.has(word))
    .join(" ");
  // A qualifier left stranded after its number was removed.
  title = title.replace(/\s*(אחה"צ|אחה״צ|אחרי הצהריים|בצהריים|בערב|בלילה|בבוקר)\s*/g, " ");
  title = title.replace(/\s+/g, " ").trim();
  // A leading preposition left behind once the date/time came out.
  title = title.replace(/^(ב|ל|עם)\s+/, "").trim();
  return title;
}

/**
 * Parses a free-text Hebrew scheduling request into a concrete event.
 *
 * Returns null when there is no explicit time — see the module header: the
 * caller should surface a clarifying question rather than invent an hour.
 */
export function parseHebrewEvent(text: string, now: Date): ParsedEvent | null {
  const clean = text.trim();
  if (!clean) return null;

  const time = findTime(clean);
  if (!time) return null;

  const { date, matched: dateMatched } = findDate(clean, now);
  const title = buildTitle(clean, dateMatched, time.matched);
  if (!title) return null;

  return {
    title,
    start: wallClock(date, time.hour, time.minute),
    durationMinutes: DEFAULT_DURATION_MINUTES,
  };
}
