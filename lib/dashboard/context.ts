import {
  energyAt,
  energyAdvice,
  energyWindows,
  hourLabel,
  type EnergyPoint,
  type EnergyWindow,
} from "@/lib/health/energyCurve";
import { visibleWidgets, type DashboardLayout, type WidgetDefinition } from "@/lib/dashboard/layout";

// The context-aware dashboard: what the day is asking for right now.
//
// Layered OVER lib/dashboard/layout.ts, never into it. The user's saved
// arrangement is data they made; this module only ever produces a *derived*
// display order from it (contextualWidgets) and a set of extra cards to show
// beside it. Nothing here writes a layout, so turning the feature off — or a
// bug in it — costs the user nothing they had.
//
// Pure and clock-free (`now` is always a parameter), like the rest of lib/, so
// every boundary below is testable without mocking time.

export type ContextWindow = "morning" | "work" | "evening" | "night";

/**
 * The compact cards the context band can show. Separate from the dashboard's
 * widget registry on purpose: adding a registry widget appends it, visible, to
 * every user's saved layout (normalizeLayout), which would push a dozen new
 * cards into arrangements people built by hand.
 */
export type ContextCardId =
  | "energy"
  | "torah"
  | "water"
  | "top-three"
  | "priority-tasks"
  | "focus"
  | "fuel"
  | "family"
  | "reflection"
  | "gratitude"
  | "habits"
  | "sleep"
  | "tomorrow";

interface ContextProfile {
  label: string;
  tagline: string;
  /** Band cards, most important first. */
  cards: ContextCardId[];
  /** Ids from the dashboard registry (lib/dashboard/layout.ts WIDGETS) worth floating up. */
  promote: string[];
}

export const CONTEXT_PROFILES: Record<ContextWindow, ContextProfile> = {
  morning: {
    label: "בוקר",
    tagline: "התחלה מרוכזת — תורה, מים, שלושת הדברים החשובים ותחזית האנרגיה",
    cards: ["torah", "water", "top-three", "energy"],
    promote: ["hebrew-calendar", "intention", "now-next"],
  },
  work: {
    label: "שעות עבודה",
    tagline: "ביצוע — משימות בעדיפות, טיימר מיקוד ותדלוק קל",
    cards: ["priority-tasks", "focus", "fuel", "energy"],
    // The Smart Calendar surfaces: where I am now, and the shape of the day.
    promote: ["now-next", "today-structure", "upcoming-moments"],
  },
  evening: {
    label: "ערב",
    tagline: "בית ומשפחה — קשר, הרהור על היום, הכרת תודה וסיכום הרגלים",
    cards: ["family", "reflection", "gratitude", "habits"],
    promote: ["memories", "recent-activity", "today-structure"],
  },
  night: {
    label: "לילה",
    tagline: "רגיעה — הכנה לשינה ומבט אל מחר",
    cards: ["sleep", "tomorrow"],
    promote: ["upcoming-moments", "motivation"],
  },
};

// --- Time windows -----------------------------------------------------------

const MIN = 60;
const MORNING_START = 6 * MIN;
const WORK_START = 10 * MIN;
const EVENING_START = 17 * MIN;
const NIGHT_START = 22 * MIN;
/** The hour between two windows, where the day is handing over. */
const TRANSITION_LENGTH = MIN;

export interface ContextTransition {
  from: ContextWindow;
  to: ContextWindow;
  /** 0 at the start of the hour, approaching 1 at its end. */
  progress: number;
}

export interface ContextState {
  /**
   * The window currently leading. Inside a transition this is the outgoing
   * window for the first half hour and the incoming one for the second, so a
   * label built from it flips once, at the midpoint, rather than jumping at a
   * hard edge.
   */
  window: ContextWindow;
  transition: ContextTransition | null;
}

/**
 * Where a minute-of-day sits:
 *   06:00–09:00 morning · 09:00–10:00 → work · 10:00–16:00 work ·
 *   16:00–17:00 → evening · 17:00–22:00 evening · 22:00–06:00 night.
 *
 * The two gaps in the spec (09–10, 16–17) are not a fifth and sixth state; they
 * are a handover, and are reported as one so the UI can blend rather than
 * snap. Night runs through midnight to 06:00 — a dashboard that showed
 * "evening" at 02:00 would be a bug, not a preference.
 */
export function contextAt(minuteOfDay: number): ContextState {
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;

  const handover = (from: ContextWindow, to: ContextWindow, start: number): ContextState => {
    const progress = (m - start) / TRANSITION_LENGTH;
    return { window: progress < 0.5 ? from : to, transition: { from, to, progress } };
  };

  if (m >= NIGHT_START || m < MORNING_START) return { window: "night", transition: null };
  if (m < WORK_START - TRANSITION_LENGTH) return { window: "morning", transition: null };
  if (m < WORK_START) return handover("morning", "work", WORK_START - TRANSITION_LENGTH);
  if (m < EVENING_START - TRANSITION_LENGTH) return { window: "work", transition: null };
  if (m < EVENING_START) return handover("work", "evening", EVENING_START - TRANSITION_LENGTH);
  return { window: "evening", transition: null };
}

/**
 * Two ranked lists woven into one, leading with `first`. Duplicates keep their
 * first (highest) position. This is what makes a handover gradual: at 09:10
 * the morning list leads with one work item folded in; by 09:40 the work list
 * leads with one morning item still trailing.
 */
export function interleave<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  const push = (item: T | undefined) => {
    if (item === undefined || seen.has(item)) return;
    seen.add(item);
    out.push(item);
  };
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    push(first[i]);
    push(second[i]);
  }
  return out;
}

// --- Energy -----------------------------------------------------------------

export type EnergyBand = "peak" | "steady" | "low" | "rest";
export type TaskIntensity = "deep" | "regular" | "light" | "rest";

export interface EnergyGuidance {
  /** 0..1, interpolated to the minute. */
  level: number;
  band: EnergyBand;
  /** How demanding the next task should be. */
  intensity: TaskIntensity;
  /** One line, Hebrew — lib/health/energyCurve.ts's own advice. */
  advice: string;
  /** The peak window we are inside, if any. */
  activePeak?: EnergyWindow;
  /** The next peak later today, if any. */
  nextPeak?: EnergyWindow;
  /** Every peak of the day, for the morning preview. */
  peaks: EnergyWindow[];
}

const INTENSITY_BY_BAND: Record<EnergyBand, TaskIntensity> = {
  peak: "deep",
  steady: "regular",
  low: "light",
  rest: "rest",
};

/**
 * Reads the circadian model (lib/health/energyCurve.ts) at `now` and says what
 * kind of work it suits. The band thresholds are the model's own — 0.8 and up
 * is what energyWindows() calls a peak, 0.55 and down a rest — so "peak" here
 * and the window highlighted on the Health page can never disagree.
 */
export function energyGuidance(curve: readonly EnergyPoint[], now: Date): EnergyGuidance {
  const level = energyAt(curve, now);
  const windows = energyWindows(curve);
  const hour = now.getHours();
  const asleep = curve[hour]?.asleep === true;

  const band: EnergyBand = asleep ? "rest" : level >= 0.8 ? "peak" : level <= 0.55 ? "low" : "steady";
  const peaks = windows.filter((w) => w.kind === "peak");

  return {
    level,
    band,
    intensity: INTENSITY_BY_BAND[band],
    advice: energyAdvice(level, windows, now),
    activePeak: peaks.find((w) => hour >= w.startHour && hour < w.endHour),
    nextPeak: peaks.find((w) => w.startHour > hour),
    peaks,
  };
}

/** "10:00–13:00". */
export function windowRangeLabel(window: Pick<EnergyWindow, "startHour" | "endHour">): string {
  return `${hourLabel(window.startHour)}–${hourLabel(window.endHour)}`;
}

/** Whether a card asks for concentration or is a small, easy act. */
const CARD_DEMAND: Partial<Record<ContextCardId, "deep" | "light">> = {
  "priority-tasks": "deep",
  focus: "deep",
  water: "light",
  fuel: "light",
  gratitude: "light",
  sleep: "light",
};

/**
 * Stable re-rank of band cards by how much energy there is. With a peak open,
 * the demanding cards lead; with energy low, the easy ones do and the
 * demanding ones drop to the end — but never off the band, because a card that
 * vanishes when someone is tired is a card they can't reach when they decide
 * to push through.
 */
function rankByEnergy(cards: ContextCardId[], band: EnergyBand): ContextCardId[] {
  if (band !== "peak" && band !== "low") return cards;
  const front = band === "peak" ? "deep" : "light";
  const back = band === "peak" ? "light" : "deep";
  const weight = (id: ContextCardId) => (CARD_DEMAND[id] === front ? 0 : CARD_DEMAND[id] === back ? 2 : 1);
  return cards
    .map((id, index) => ({ id, index }))
    .sort((a, b) => weight(a.id) - weight(b.id) || a.index - b.index)
    .map((entry) => entry.id);
}

// --- Putting it together ----------------------------------------------------

export const MAX_BAND_CARDS = 4;
export const MAX_PROMOTED = 3;

export interface ResolvedContext {
  window: ContextWindow;
  transition: ContextTransition | null;
  label: string;
  tagline: string;
  cards: ContextCardId[];
  promote: string[];
  energy: EnergyGuidance;
}

/**
 * The whole answer for one moment: which window, what to show in the band, what
 * to float up in the grid, and how hard the next task should be.
 *
 * During a handover both windows contribute — the leading one first, woven
 * with the other — and the band is capped, so the change of scene is a slow
 * turn of the same four slots, not a swap.
 */
export function resolveContext(now: Date, curve: readonly EnergyPoint[]): ResolvedContext {
  const { window, transition } = contextAt(now.getHours() * 60 + now.getMinutes());
  const energy = energyGuidance(curve, now);

  const profile = CONTEXT_PROFILES[window];
  let cards = profile.cards;
  let promote = profile.promote;

  if (transition) {
    const from = CONTEXT_PROFILES[transition.from];
    const to = CONTEXT_PROFILES[transition.to];
    const [lead, follow] = window === transition.from ? [from, to] : [to, from];
    cards = interleave(lead.cards, follow.cards);
    promote = interleave(lead.promote, follow.promote);
  }

  return {
    window,
    transition,
    label: profile.label,
    tagline: transition ? `${profile.tagline} · מעבר הדרגתי` : profile.tagline,
    cards: rankByEnergy(cards.slice(0, MAX_BAND_CARDS), energy.band),
    promote,
    energy,
  };
}

// --- The grid, layered over the user's layout --------------------------------

/** Widgets that keep a leading slot if the user put them there. */
const PINNED_LEAD = new Set(["command-bar"]);

/**
 * The user's visible widgets, with context-relevant ones floated up.
 *
 * What is preserved, and how:
 *  - The stored layout is not touched — this returns a new display order.
 *  - Hidden stays hidden. A widget the user put away is not un-hidden because
 *    it suits the hour.
 *  - A leading command bar stays leading; it is the input everything else hangs off.
 *  - At most MAX_PROMOTED widgets move, and they keep the user's own relative
 *    order among themselves. Everything else stays exactly where it was.
 */
export function contextualWidgets(layout: DashboardLayout, promote: readonly string[]): WidgetDefinition[] {
  const visible = visibleWidgets(layout);

  let lead = 0;
  while (lead < visible.length && PINNED_LEAD.has(visible[lead].id)) lead++;
  const head = visible.slice(0, lead);
  const rest = visible.slice(lead);

  const restIds = new Set(rest.map((w) => w.id));
  const chosen = new Set(promote.filter((id) => restIds.has(id)).slice(0, MAX_PROMOTED));

  return [...head, ...rest.filter((w) => chosen.has(w.id)), ...rest.filter((w) => !chosen.has(w.id))];
}

// --- Tasks, by energy ---------------------------------------------------------
//
// Which tasks to surface at which energy lives in the cross-module engine
// (lib/intelligence/crossModule/energyTasks.ts). What stays here is the one line
// of copy that explains the current intensity.

/** One line telling the user what the current energy suits, for the task card. */
export function intensityHint(energy: EnergyGuidance): string {
  switch (energy.intensity) {
    case "deep":
      return energy.activePeak
        ? `חלון שיא עד ${hourLabel(energy.activePeak.endHour)} — קח/י קודם את המשימה התובענית.`
        : "אנרגיה גבוהה — קח/י קודם את המשימה התובענית.";
    case "regular":
      return energy.nextPeak
        ? `אנרגיה יציבה — עבודה רגילה. השיא הבא ב-${hourLabel(energy.nextPeak.startHour)}.`
        : "אנרגיה יציבה — עבודה רגילה וסגירת קצוות.";
    case "light":
      return "אנרגיה נמוכה — קודם משימות קצרות וקלות. דחופים תמיד נשארים ראשונים.";
    case "rest":
      return "שעת מנוחה — עדיף לא להתחיל עכשיו משימה תובענית.";
  }
}

// --- Preference --------------------------------------------------------------

export interface ContextPreference {
  enabled: boolean;
}

export const DEFAULT_CONTEXT_PREFERENCE: ContextPreference = { enabled: true };

/** A stored value that isn't a clear "off" means on — the default is the feature. */
export function parseContextPreference(stored: unknown): ContextPreference {
  if (stored && typeof stored === "object" && (stored as { enabled?: unknown }).enabled === false) {
    return { enabled: false };
  }
  return DEFAULT_CONTEXT_PREFERENCE;
}

// --- Previewing another time of day -------------------------------------------

/**
 * "?contextAt=09:50" → { hour: 9, minute: 50 }, or null when absent or invalid.
 *
 * A way to see the dashboard as it will look at another hour, without waiting
 * for it. Consumed only in development (hooks/useDashboardContext.ts gates it
 * on NODE_ENV), so it cannot change what a real user sees.
 */
export function parseContextOverride(search: string): { hour: number; minute: number } | null {
  const raw = new URLSearchParams(search).get("contextAt");
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw?.trim() ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}
