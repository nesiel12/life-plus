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
  /** Representative clock window, shown under the label. */
  range: string;
}

export const DAY_PARTS: DayPartMeta[] = [
  { key: "earlyMorning", label: "בוקר מוקדם", range: "05:00–08:00" },
  { key: "morning", label: "בוקר", range: "08:00–12:00" },
  { key: "afternoon", label: "צהריים", range: "12:00–16:00" },
  { key: "evening", label: "ערב", range: "16:00–20:00" },
  { key: "night", label: "לילה", range: "20:00–24:00" },
];

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
