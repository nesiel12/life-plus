// Turning the weekly skeleton into Google Calendar events.
//
// Pure: given the routine blocks, a "today", a timezone and a scope, it
// produces the exact `events.insert` bodies. The route just POSTs them. One
// event per block (recurring) rather than one per occurrence — a term-long
// "work Sun–Thu 09:00" is a rule, not 80 rows.

import type { RoutineBlock } from "@/lib/schedule/routine";
import { blocksForDay, ROUTINE_KIND_LABELS } from "@/lib/schedule/routine";

const RRULE_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

export type BackboneScope = "1d" | "2d" | "1m" | "1y" | "single";

export const BACKBONE_SCOPE_LABELS: Record<BackboneScope, string> = {
  "1d": "יום אחד",
  "2d": "יומיים",
  "1m": "חודש",
  "1y": "שנה",
  single: "מופע יחיד (הקרוב)",
};

interface GoogleEventBody {
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence?: string[];
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DDTHH:MM:SS" local wall-clock for a date + minute-of-day. */
function wallClock(date: Date, minute: number): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    Math.floor(minute / 60)
  )}:${pad(minute % 60)}:00`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** The soonest date on/after `from` whose weekday is in `weekdays`. */
function firstOccurrence(from: Date, weekdays: number[]): Date | null {
  if (weekdays.length === 0) return null;
  for (let i = 0; i < 7; i++) {
    const candidate = addDays(from, i);
    if (weekdays.includes(candidate.getDay())) return candidate;
  }
  return null;
}

/** UNTIL as a UTC date-time string, end of the given local day. */
function untilStamp(date: Date): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T235900Z`;
}

export interface BackboneSyncPlan {
  events: GoogleEventBody[];
  /** Blocks that produced no event (e.g. no weekday matched the window). */
  skipped: string[];
}

export function planBackboneSync(params: {
  blocks: RoutineBlock[];
  today: Date;
  timeZone: string;
  scope: BackboneScope;
}): BackboneSyncPlan {
  const { blocks, today, timeZone, scope } = params;
  const active = blocks.filter((b) => b.isActive);

  const events: GoogleEventBody[] = [];
  const skipped: string[] = [];

  // "single" = one concrete occurrence per block, no recurrence.
  if (scope === "single") {
    for (const block of active) {
      const day = firstOccurrence(today, block.weekdays);
      if (!day) {
        skipped.push(block.title);
        continue;
      }
      events.push({
        summary: block.title,
        description: `שלד הלו״ז · ${ROUTINE_KIND_LABELS[block.kind]}`,
        start: { dateTime: wallClock(day, block.startMinute), timeZone },
        end: { dateTime: wallClock(day, block.endMinute), timeZone },
      });
    }
    return { events, skipped };
  }

  const untilByScope: Record<Exclude<BackboneScope, "single">, Date> = {
    "1d": addDays(today, 0),
    "2d": addDays(today, 1),
    "1m": addDays(today, 30),
    "1y": addDays(today, 365),
  };
  const until = untilByScope[scope];

  for (const block of active) {
    const day = firstOccurrence(today, block.weekdays);
    if (!day || day > until) {
      skipped.push(block.title);
      continue;
    }
    const byDay = [...block.weekdays].sort((a, b) => a - b).map((d) => RRULE_DAYS[d]).join(",");
    events.push({
      summary: block.title,
      description: `שלד הלו״ז · ${ROUTINE_KIND_LABELS[block.kind]}`,
      start: { dateTime: wallClock(day, block.startMinute), timeZone },
      end: { dateTime: wallClock(day, block.endMinute), timeZone },
      recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${untilStamp(until)}`],
    });
  }

  return { events, skipped };
}

/** Just for a preview count in the UI, no network. */
export function countBackboneOccurrences(blocks: RoutineBlock[], scope: BackboneScope): number {
  const active = blocks.filter((b) => b.isActive);
  if (scope === "single") return active.length;
  const weeks = { "1d": 1, "2d": 1, "1m": 4, "1y": 52 }[scope];
  let total = 0;
  for (let day = 0; day < 7; day++) {
    total += blocksForDay(active, day).length;
  }
  return total * weeks;
}
