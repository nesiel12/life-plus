// Working out who has quietly fallen off the radar.
//
// Pure, so the thresholds and the "don't nag" rules are testable without a
// database. The whole feature turns on getting those rules right: a
// relationship nudge that fires too eagerly is noise someone learns to
// ignore, which costs more than never having built it.

export interface NeglectCandidate {
  id: string;
  name: string;
  hebrewName?: string;
  relation: string;
  phone?: string;
  /** ISO instant of the last logged meaningful contact. */
  lastMeaningfulInteraction?: string;
  /** "MM-DD". */
  birthday?: string;
  createdAt: string;
}

/**
 * How long is too long, by relation.
 *
 * Different relationships have genuinely different natural rhythms — a
 * fortnight without speaking to a grandparent is worth noticing; a fortnight
 * without speaking to a colleague is a Tuesday. Anything unrecognised gets
 * the most forgiving threshold, so an unusual relation label produces silence
 * rather than a false alarm.
 */
const DEFAULT_THRESHOLD_DAYS = 45;

const THRESHOLD_BY_RELATION: { match: RegExp; days: number }[] = [
  { match: /סבא|סבתא|grandparent|grandfather|grandmother/i, days: 14 },
  { match: /אמא|אבא|הורה|mother|father|mom|dad|parent/i, days: 10 },
  { match: /אח|אחות|sibling|brother|sister/i, days: 21 },
  { match: /בן|בת|ילד|child|son|daughter/i, days: 14 },
  { match: /חבר|friend/i, days: 30 },
];

export function thresholdDaysFor(relation: string): number {
  return THRESHOLD_BY_RELATION.find((rule) => rule.match.test(relation))?.days ?? DEFAULT_THRESHOLD_DAYS;
}

const DAY_MS = 86_400_000;

export interface NeglectSignal {
  person: NeglectCandidate;
  daysSince: number;
  thresholdDays: number;
  /** How far past the threshold, as a ratio — the ranking key. */
  overdueRatio: number;
  /** Set when their birthday is inside the next week. */
  birthdayInDays?: number;
}

/** Days until the next occurrence of an "MM-DD" birthday. */
export function daysUntilBirthday(birthday: string, at: Date): number | null {
  const match = /^(\d{2})-(\d{2})$/.exec(birthday);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const today = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  let next = new Date(Date.UTC(at.getUTCFullYear(), month - 1, day));
  if (next.getTime() < today.getTime()) {
    next = new Date(Date.UTC(at.getUTCFullYear() + 1, month - 1, day));
  }
  return Math.round((next.getTime() - today.getTime()) / DAY_MS);
}

/**
 * Who is worth reaching out to, most overdue first.
 *
 * A contact with no interaction ever logged is measured from when they were
 * added, not treated as infinitely overdue — otherwise importing a contact
 * list would produce a wall of accusations on day one.
 */
export function findNeglected(
  people: NeglectCandidate[],
  at: Date,
  options: { limit?: number } = {}
): NeglectSignal[] {
  const signals: NeglectSignal[] = [];

  for (const person of people) {
    const since = person.lastMeaningfulInteraction ?? person.createdAt;
    const sinceMs = new Date(since).getTime();
    if (!Number.isFinite(sinceMs)) continue;

    const daysSince = Math.floor((at.getTime() - sinceMs) / DAY_MS);
    const thresholdDays = thresholdDaysFor(person.relation);
    const birthdayInDays = person.birthday ? daysUntilBirthday(person.birthday, at) : null;
    const birthdaySoon = birthdayInDays !== null && birthdayInDays <= 7;

    // A birthday inside the week is its own reason to get in touch, whether
    // or not they are overdue.
    if (daysSince < thresholdDays && !birthdaySoon) continue;

    signals.push({
      person,
      daysSince,
      thresholdDays,
      overdueRatio: daysSince / thresholdDays,
      ...(birthdaySoon ? { birthdayInDays: birthdayInDays as number } : {}),
    });
  }

  return signals
    .sort((a, b) => {
      // An imminent birthday outranks being overdue: the date is fixed and
      // passes, where "overdue" only gets more so.
      const aBirthday = a.birthdayInDays ?? Infinity;
      const bBirthday = b.birthdayInDays ?? Infinity;
      if (aBirthday !== bBirthday) return aBirthday - bBirthday;
      return b.overdueRatio - a.overdueRatio;
    })
    .slice(0, options.limit ?? 3);
}

/** The one-line reason, in Hebrew. */
export function describeNeglect(signal: NeglectSignal): string {
  const name = signal.person.hebrewName ?? signal.person.name;

  if (signal.birthdayInDays !== undefined) {
    if (signal.birthdayInDays === 0) return `היום יום ההולדת של ${name}`;
    if (signal.birthdayInDays === 1) return `מחר יום ההולדת של ${name}`;
    return `יום ההולדת של ${name} בעוד ${signal.birthdayInDays} ימים`;
  }

  if (signal.daysSince >= 60) {
    const months = Math.floor(signal.daysSince / 30);
    return `לא דיברת עם ${name} כבר ${months} חודשים`;
  }
  if (signal.daysSince >= 14) {
    const weeks = Math.floor(signal.daysSince / 7);
    return `לא דיברת עם ${name} כבר ${weeks} שבועות`;
  }
  return `לא דיברת עם ${name} כבר ${signal.daysSince} ימים`;
}
