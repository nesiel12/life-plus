import type { ChronotypeSettings, DayPart } from "@/types";

// The day-part vocabulary the chronotype step speaks in. App config, not a
// database concern — personal_dna.chronotype_settings stores the keys and
// this module owns their labels and ordering.
//
// Deliberately no lucide-react import: this module is reachable from the
// server-side context builder via the summary helper below, and pulling the
// React runtime into a server job is what broke `npm run cron` before (see
// the header of lib/lifeAreas.ts).
export interface DayPartMeta {
  key: DayPart;
  label: string;
  /** Inclusive start hour, 0-23. */
  startHour: number;
  /** Exclusive end hour, 1-24. */
  endHour: number;
  /** Representative clock window, shown under the label. Derived from the
   *  hour bounds so the label and the scheduling maths can never drift. */
  range: string;
}

const hh = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

function dayPart(key: DayPart, label: string, startHour: number, endHour: number): DayPartMeta {
  return { key, label, startHour, endHour, range: `${hh(startHour)}–${hh(endHour)}` };
}

// The hour bounds are the single source of truth for both the wizard's chips
// and the calendar's energy banding (lib/calendar/energy.ts). They tile 05:00
// through 24:00 with no gaps or overlaps; 00:00-05:00 is deliberately
// uncovered — it belongs to sleep, not to a focus window.
export const DAY_PARTS: DayPartMeta[] = [
  dayPart("earlyMorning", "בוקר מוקדם", 5, 8),
  dayPart("morning", "בוקר", 8, 12),
  dayPart("afternoon", "צהריים", 12, 16),
  dayPart("evening", "ערב", 16, 20),
  dayPart("night", "לילה", 20, 24),
];

const META_BY_KEY = new Map(DAY_PARTS.map((part) => [part.key, part]));

/** The day part an hour-of-day falls in, or null for the small hours. */
export function dayPartForHour(hour: number): DayPart | null {
  return DAY_PARTS.find((p) => hour >= p.startHour && hour < p.endHour)?.key ?? null;
}

export function dayPartMeta(key: DayPart): DayPartMeta | undefined {
  return META_BY_KEY.get(key);
}

const LABEL_BY_KEY = new Map(DAY_PARTS.map((part) => [part.key, part.label]));

export function dayPartLabel(key: DayPart): string {
  return LABEL_BY_KEY.get(key) ?? key;
}

export function dayPartLabels(keys: DayPart[]): string {
  return keys.map(dayPartLabel).join(", ");
}

// personal_dna.peak_focus_hours is a free-text column that predates the
// structured chronotype, and four live consumers still read it:
// lib/intelligence/core/normalize.ts (ranked AI signals), buildSystemPrompt,
// app/areas/time/page.tsx and DailyRecommendations. Rather than migrate them
// all to the new shape in this change, the wizard keeps that column populated
// with a readable Hebrew rendering of the same answers, so nothing regresses
// and the AI keeps seeing focus hours exactly as it did before.
export function summarizePeakFocus(chronotype: ChronotypeSettings): string | undefined {
  const parts = chronotype.peakFocusHours ?? [];
  if (parts.length === 0) return undefined;
  return dayPartLabels(parts);
}

// Same reasoning for sleep_notes, which normalize.ts also surfaces.
export function summarizeSleep(chronotype: ChronotypeSettings): string | undefined {
  const { wakeTime, sleepTime } = chronotype;
  if (!wakeTime && !sleepTime) return undefined;
  if (wakeTime && sleepTime) return `שינה ${sleepTime}, קימה ${wakeTime}`;
  return wakeTime ? `קימה ${wakeTime}` : `שינה ${sleepTime}`;
}

export function isDayPart(value: unknown): value is DayPart {
  return typeof value === "string" && LABEL_BY_KEY.has(value as DayPart);
}
