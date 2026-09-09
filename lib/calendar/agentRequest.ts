import { z } from "zod";
import { parseHebrewEvent } from "@/lib/calendar/parseHebrewEvent";
import { zonedWallClockToInstant } from "@/lib/calendar/timezone";
import { sanitizeEventTitle } from "@/lib/calendar/sanitizeEventTitle";
import { hasConflict, type Interval } from "@/lib/calendar/findFocusSlots";
import { isDayPart } from "@/lib/onboarding/chronotype";
import type { ChronotypeSettings, DayPart } from "@/types";

// The calendar-agent request body — and the deterministic reading of it that
// backs the AI up. Kept out of the route (which owns only auth + rate limit)
// so this is unit-tested directly.
//
// The body is client-supplied telemetry about the user's own device: its
// clock, its timezone, what is already on their calendar. NONE of it is worth
// a 400. A stale chronotype shape from an old DB row, an all-day event with a
// date-only `start`, a missing timezone — the honest response to any of that
// is "use what parsed, fall back for the rest", never "your scheduling
// request is malformed". Every field therefore defaults or `.catch()`es, so a
// well-formed `message` alone always gets a real answer. (This is the bug
// behind "entering 'פגישה מחר ב-14:30' throws לא הצלחנו לפרש": a null
// chronotype failed `z.object()`, and parseJsonBody turned that into a 400
// whose body the client rendered as the generic parse error.)

export const NOW_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const MAX_BUSY = 60;

const intervalSchema = z
  .object({
    start: z.string().optional(),
    end: z.string().optional(),
    title: z.string().optional(),
  })
  .catch({});

const chronotypeSchema = z
  .object({
    wakeTime: z.string().optional().catch(undefined),
    sleepTime: z.string().optional().catch(undefined),
    peakFocusHours: z.array(z.string()).optional().catch(undefined),
    lowEnergyHours: z.array(z.string()).optional().catch(undefined),
  })
  .catch({});

export const calendarAgentRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  /** Client's local wall clock, "YYYY-MM-DDTHH:MM". Anything not that exact
   *  shape is dropped and the server's clock (in the user's zone) is used —
   *  see resolveNowLocal. */
  nowLocal: z.string().catch("").default(""),
  timeZone: z.string().trim().min(1).max(60).catch("Asia/Jerusalem").default("Asia/Jerusalem"),
  busy: z.array(intervalSchema).max(MAX_BUSY).catch([]).default([]),
  chronotype: chronotypeSchema.default({}),
});

export type CalendarAgentRequest = z.infer<typeof calendarAgentRequestSchema>;

export type ValidBusy = { start: string; end: string; title?: string };

/** Drop the busy entries that lost a required field to `.catch({})`. */
export function keepBusy(raw: CalendarAgentRequest["busy"]): ValidBusy[] {
  return raw.filter(
    (b): b is ValidBusy => typeof b.start === "string" && typeof b.end === "string"
  );
}

export function toChronotype(raw: CalendarAgentRequest["chronotype"]): ChronotypeSettings {
  const keep = (values: string[] | undefined): DayPart[] | undefined => values?.filter(isDayPart);
  return {
    wakeTime: raw.wakeTime,
    sleepTime: raw.sleepTime,
    peakFocusHours: keep(raw.peakFocusHours),
    lowEnergyHours: keep(raw.lowEnergyHours),
  };
}

/** "YYYY-MM-DDTHH:MM" for an instant, read in `timeZone`. */
export function wallClockIn(timeZone: string, ms: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** The client's wall clock if it sent a usable one, else the server's clock
 *  rendered in the user's timezone. Never fails — "tomorrow" always resolves. */
export function resolveNowLocal(fromClient: string, timeZone: string): string {
  if (NOW_LOCAL_RE.test(fromClient)) return fromClient;
  try {
    return wallClockIn(timeZone, Date.now());
  } catch {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

export interface DeterministicProposal {
  status: "proposed";
  event: {
    title: string;
    start: string;
    end: string;
    startLocal: string;
    endLocal: string;
    timeZone: string;
    durationMinutes: number;
  };
  conflict: boolean;
  alternatives: never[];
  degraded: true;
}

/**
 * The deterministic reading of a request — used when the AI is down, when no
 * provider is configured, and as a rescue when the model returns "unclear"
 * for something the regex parser can in fact resolve. Returns null only when
 * there is genuinely no explicit time in the message (see parseHebrewEvent).
 */
export function deterministicProposal(
  message: string,
  timeZone: string,
  busy: ValidBusy[],
  anchor: Date
): DeterministicProposal | null {
  const parsed = parseHebrewEvent(message, anchor);
  if (!parsed) return null;

  const start = zonedWallClockToInstant(parsed.start, timeZone) ?? new Date(`${parsed.start}:00`);
  const endMs = start.getTime() + parsed.durationMinutes * 60_000;
  const end = new Date(endMs);
  const intervals: Interval[] = busy.map((b) => ({ start: b.start, end: b.end }));

  return {
    status: "proposed",
    event: {
      title: sanitizeEventTitle(parsed.title),
      start: start.toISOString(),
      end: end.toISOString(),
      startLocal: wallClockIn(timeZone, start.getTime()),
      endLocal: wallClockIn(timeZone, endMs),
      timeZone,
      durationMinutes: parsed.durationMinutes,
    },
    conflict: hasConflict(start.toISOString(), end.toISOString(), intervals),
    alternatives: [],
    degraded: true,
  };
}
