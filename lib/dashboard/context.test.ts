import { describe, expect, it } from "vitest";
import {
  CONTEXT_PROFILES,
  MAX_BAND_CARDS,
  MAX_PROMOTED,
  contextAt,
  contextualWidgets,
  energyGuidance,
  intensityHint,
  interleave,
  parseContextOverride,
  parseContextPreference,
  resolveContext,
  windowRangeLabel,
  type ContextWindow,
} from "@/lib/dashboard/context";
import { DEFAULT_LAYOUT, WIDGETS, normalizeLayout, setHidden, type DashboardLayout } from "@/lib/dashboard/layout";
import { energyCurve } from "@/lib/health/energyCurve";

const at = (h: number, m = 0) => h * 60 + m;
const clock = (h: number, m = 0) => new Date(2026, 8, 20, h, m, 0);
// Constant, awake, mid-energy: isolates window blending from the energy re-rank.
const steadyCurve = Array.from({ length: 24 }, (_, hour) => ({ hour, energy: 0.7, asleep: false }));

describe("contextAt — the four windows", () => {
  it.each<[string, number, ContextWindow]>([
    ["06:00 opens the morning", at(6), "morning"],
    ["08:59 is still morning", at(8, 59), "morning"],
    ["10:00 is work", at(10), "work"],
    ["15:59 is still work", at(15, 59), "work"],
    ["17:00 is evening", at(17), "evening"],
    ["21:59 is still evening", at(21, 59), "evening"],
    ["22:00 is night", at(22), "night"],
    ["midnight is night", at(0), "night"],
    ["02:30 is night, not a stray evening", at(2, 30), "night"],
    ["05:59 is night", at(5, 59), "night"],
  ])("%s", (_name, minute, expected) => {
    const state = contextAt(minute);
    expect(state.window).toBe(expected);
    expect(state.transition).toBeNull();
  });

  it("wraps out-of-range minutes rather than falling off the day", () => {
    expect(contextAt(at(24, 30)).window).toBe("night");
    expect(contextAt(-30).window).toBe("night");
    expect(contextAt(at(6) + 1440).window).toBe("morning");
  });
});

describe("contextAt — the two gaps are handovers, not holes", () => {
  it("09:00–10:00 hands morning over to work", () => {
    for (const minute of [at(9), at(9, 15), at(9, 29), at(9, 30), at(9, 59)]) {
      const { transition } = contextAt(minute);
      expect(transition).not.toBeNull();
      expect(transition).toMatchObject({ from: "morning", to: "work" });
    }
  });

  it("16:00–17:00 hands work over to evening", () => {
    for (const minute of [at(16), at(16, 30), at(16, 59)]) {
      expect(contextAt(minute).transition).toMatchObject({ from: "work", to: "evening" });
    }
  });

  it("leads with the outgoing window for the first half hour, the incoming for the second", () => {
    expect(contextAt(at(9, 0)).window).toBe("morning");
    expect(contextAt(at(9, 29)).window).toBe("morning");
    expect(contextAt(at(9, 30)).window).toBe("work");
    expect(contextAt(at(9, 59)).window).toBe("work");
    expect(contextAt(at(16, 29)).window).toBe("work");
    expect(contextAt(at(16, 30)).window).toBe("evening");
  });

  it("reports progress from 0 to just under 1, and never leaves a minute unassigned", () => {
    expect(contextAt(at(9)).transition?.progress).toBe(0);
    expect(contextAt(at(9, 30)).transition?.progress).toBe(0.5);
    expect(contextAt(at(9, 59)).transition!.progress).toBeCloseTo(59 / 60);
    for (let minute = 0; minute < 1440; minute++) {
      expect(["morning", "work", "evening", "night"]).toContain(contextAt(minute).window);
    }
  });
});

describe("interleave", () => {
  it("weaves two ranked lists, leading with the first", () => {
    expect(interleave(["a", "b", "c"], ["x", "y", "z"])).toEqual(["a", "x", "b", "y", "c", "z"]);
    expect(interleave(["x", "y"], ["a", "b", "c"])).toEqual(["x", "a", "y", "b", "c"]);
  });

  it("keeps a duplicate at its highest position only", () => {
    expect(interleave(["energy", "a"], ["b", "energy"])).toEqual(["energy", "b", "a"]);
  });

  it("handles empty sides", () => {
    expect(interleave([], ["a"])).toEqual(["a"]);
    expect(interleave(["a"], [])).toEqual(["a"]);
    expect(interleave([], [])).toEqual([]);
  });
});

describe("profiles", () => {
  it("only promote widgets that exist in the dashboard registry", () => {
    const known = new Set(WIDGETS.map((w) => w.id));
    for (const profile of Object.values(CONTEXT_PROFILES)) {
      for (const id of profile.promote) expect(known.has(id), id).toBe(true);
    }
  });

  it("carry every spec'd theme in its window", () => {
    expect(CONTEXT_PROFILES.morning.cards).toEqual(expect.arrayContaining(["torah", "water", "top-three", "energy"]));
    expect(CONTEXT_PROFILES.work.cards).toEqual(expect.arrayContaining(["priority-tasks", "focus", "fuel"]));
    expect(CONTEXT_PROFILES.work.promote).toEqual(expect.arrayContaining(["now-next", "today-structure"]));
    expect(CONTEXT_PROFILES.evening.cards).toEqual(
      expect.arrayContaining(["family", "reflection", "gratitude", "habits"])
    );
    expect(CONTEXT_PROFILES.night.cards).toEqual(expect.arrayContaining(["sleep", "tomorrow"]));
  });

  it("never list a card twice", () => {
    for (const profile of Object.values(CONTEXT_PROFILES)) {
      expect(new Set(profile.cards).size).toBe(profile.cards.length);
    }
  });
});

describe("energyGuidance — reading lib/health/energyCurve.ts", () => {
  // The model's defaults (wake 07:00, sleep 23:00), as sampled at the half hour:
  // peaks 09–13 and 16–19, the post-lunch floor at 14:30 (0.55), asleep 23–07.
  const curve = energyCurve();

  it("maps a peak hour to deep work", () => {
    const g = energyGuidance(curve, clock(11));
    expect(g.band).toBe("peak");
    expect(g.intensity).toBe("deep");
    expect(g.activePeak).toBeDefined();
    expect(g.level).toBeGreaterThanOrEqual(0.8);
  });

  it("maps the post-lunch dip to light work and names the next peak, if any", () => {
    const dip = energyGuidance(curve, clock(14, 30));
    expect(dip.band).toBe("low");
    expect(dip.intensity).toBe("light");
    expect(dip.level).toBeLessThanOrEqual(0.55);
    // The second wind is still ahead of the dip.
    expect(dip.nextPeak?.startHour).toBe(16);
  });

  it("does not call the approach to the dip low until it actually is", () => {
    // 14:15 interpolates to ~0.57 — above the model's own 0.55 rest line.
    expect(energyGuidance(curve, clock(14, 15)).band).toBe("steady");
  });

  it("calls the hours the model marks asleep 'rest'", () => {
    const g = energyGuidance(curve, clock(3));
    expect(g.band).toBe("rest");
    expect(g.intensity).toBe("rest");
  });

  it("agrees with energyWindows about where the peak is", () => {
    const g = energyGuidance(curve, clock(6, 30));
    expect(g.peaks.length).toBeGreaterThan(0);
    for (const peak of g.peaks) {
      expect(peak.kind).toBe("peak");
      for (let hour = peak.startHour; hour < peak.endHour; hour++) expect(curve[hour].energy).toBeGreaterThanOrEqual(0.8);
    }
  });

  it("finds a peak still ahead of you", () => {
    const g = energyGuidance(curve, clock(7, 30));
    expect(g.activePeak).toBeUndefined();
    expect(g.nextPeak?.startHour).toBeGreaterThan(7);
  });

  it("formats a window as a range", () => {
    expect(windowRangeLabel({ startHour: 10, endHour: 13 })).toBe("10:00–13:00");
  });

  it("changes with the person's own chronotype", () => {
    const owl = energyCurve({ chronotype: { wakeTime: "10:00", sleepTime: "02:00" } });
    // 08:00 is well before an owl wakes — the default curve has them peaking around 11.
    expect(energyGuidance(owl, clock(8)).band).toBe("rest");
    expect(energyGuidance(curve, clock(8)).band).not.toBe("rest");
  });
});

describe("resolveContext", () => {
  const curve = energyCurve();

  it("uses the plain profile outside a handover", () => {
    const r = resolveContext(clock(7), curve);
    expect(r.window).toBe("morning");
    expect(r.transition).toBeNull();
    expect(r.label).toBe("בוקר");
    expect(r.promote).toEqual(CONTEXT_PROFILES.morning.promote);
    expect(new Set(r.cards)).toEqual(new Set(CONTEXT_PROFILES.morning.cards));
  });

  it("blends both windows during 09:00–10:00, leading with morning then work", () => {
    // A flat curve: this is about the two windows, not the energy re-rank.
    const early = resolveContext(clock(9, 10), steadyCurve);
    const late = resolveContext(clock(9, 50), steadyCurve);

    expect(early.window).toBe("morning");
    expect(late.window).toBe("work");
    for (const r of [early, late]) {
      expect(r.transition).toMatchObject({ from: "morning", to: "work" });
      expect(r.cards.length).toBeLessThanOrEqual(MAX_BAND_CARDS);
      expect(r.tagline).toContain("מעבר הדרגתי");
    }
    // Early: a morning card still leads the band, with a work card folded in.
    expect(CONTEXT_PROFILES.morning.cards).toContain(early.cards[0]);
    expect(early.cards.some((c) => CONTEXT_PROFILES.work.cards.includes(c) && !CONTEXT_PROFILES.morning.cards.includes(c))).toBe(true);
    // Late: work leads, with a morning card still trailing.
    expect(CONTEXT_PROFILES.work.promote).toContain(late.promote[0]);
    expect(late.promote).toEqual(expect.arrayContaining(["hebrew-calendar"]));
  });

  it("blends work into evening during 16:00–17:00", () => {
    const r = resolveContext(clock(16, 45), steadyCurve);
    expect(r.window).toBe("evening");
    expect(r.transition).toMatchObject({ from: "work", to: "evening" });
    expect(r.cards.some((c) => CONTEXT_PROFILES.evening.cards.includes(c))).toBe(true);
    expect(r.cards.some((c) => CONTEXT_PROFILES.work.cards.includes(c))).toBe(true);
  });

  it("never returns more than the band can hold", () => {
    for (let minute = 0; minute < 1440; minute += 5) {
      const r = resolveContext(clock(Math.floor(minute / 60), minute % 60), curve);
      expect(r.cards.length).toBeLessThanOrEqual(MAX_BAND_CARDS);
      expect(r.cards.length).toBeGreaterThan(0);
      expect(new Set(r.cards).size).toBe(r.cards.length);
    }
  });

  it("leads the work band with demanding cards at a peak and easy ones when energy is low", () => {
    const peak = resolveContext(clock(11), curve);
    expect(peak.energy.band).toBe("peak");
    expect(peak.cards.indexOf("priority-tasks")).toBeLessThan(peak.cards.indexOf("fuel"));

    const low = resolveContext(clock(14, 30), curve);
    expect(low.energy.band).toBe("low");
    expect(low.cards.indexOf("fuel")).toBeLessThan(low.cards.indexOf("priority-tasks"));
  });

  it("re-ranks by energy without ever dropping a card", () => {
    const low = resolveContext(clock(14, 30), curve);
    expect(new Set(low.cards)).toEqual(new Set(CONTEXT_PROFILES.work.cards));
  });

  it("keeps the energy card in its place when energy is steady", () => {
    const steady = resolveContext(clock(13, 30), curve);
    expect(steady.energy.band).toBe("steady");
    expect(steady.cards).toEqual(CONTEXT_PROFILES.work.cards);
  });
});

describe("contextualWidgets — layered over the user's layout", () => {
  const ids = (layout: DashboardLayout, promote: string[]) => contextualWidgets(layout, promote).map((w) => w.id);

  it("floats promoted widgets up and leaves the rest in the user's order", () => {
    const result = ids(DEFAULT_LAYOUT, ["today-structure", "motivation"]);
    // command-bar keeps its lead; the promoted pair follow it; the rest keep default order.
    expect(result[0]).toBe("command-bar");
    expect(result.slice(1, 3)).toEqual(["today-structure", "motivation"]);
    const others = result.slice(3);
    expect(others).toEqual(
      DEFAULT_LAYOUT.order.filter((id) => !["command-bar", "today-structure", "motivation"].includes(id))
    );
  });

  it("never mutates the stored layout", () => {
    const before = JSON.stringify(DEFAULT_LAYOUT);
    contextualWidgets(DEFAULT_LAYOUT, ["goals", "memories"]);
    expect(JSON.stringify(DEFAULT_LAYOUT)).toBe(before);
  });

  it("keeps a widget the user hid hidden, however well it suits the hour", () => {
    const layout = setHidden(DEFAULT_LAYOUT, "today-structure", true);
    expect(ids(layout, ["today-structure", "now-next"])).not.toContain("today-structure");
    expect(ids(layout, ["today-structure", "now-next"]).length).toBe(layout.order.length - 1);
  });

  it("keeps the user's own relative order among the widgets it promotes", () => {
    const layout: DashboardLayout = normalizeLayout({
      order: ["command-bar", "goals", "memories", "now-next", "today-structure"],
      hidden: [],
      spans: {},
    });
    // Profile lists today-structure before now-next, but the user put now-next first.
    const result = ids(layout, ["today-structure", "now-next"]);
    expect(result.indexOf("now-next")).toBeLessThan(result.indexOf("today-structure"));
    expect(result.slice(1, 3)).toEqual(["now-next", "today-structure"]);
  });

  it("keeps a leading command bar leading, and a non-leading one where it is", () => {
    expect(ids(DEFAULT_LAYOUT, ["goals"])[0]).toBe("command-bar");

    const moved: DashboardLayout = normalizeLayout({
      order: ["goals", "command-bar", ...DEFAULT_LAYOUT.order.filter((id) => id !== "goals" && id !== "command-bar")],
      hidden: [],
      spans: {},
    });
    // Not leading, so it is not pinned — it is just another widget.
    expect(ids(moved, ["memories"])[0]).toBe("memories");
  });

  it("caps how many widgets move", () => {
    const result = ids(DEFAULT_LAYOUT, ["hebrew-calendar", "intention", "now-next", "goals", "memories"]);
    const moved = result.filter((id, i) => id !== DEFAULT_LAYOUT.order[i]);
    expect(moved.length).toBeGreaterThan(0);
    // Only the first MAX_PROMOTED promoted ids float; 'goals' and 'memories' stay in place.
    expect(result.indexOf("goals")).toBeGreaterThan(MAX_PROMOTED);
    expect(result.slice(1, 1 + MAX_PROMOTED).every((id) => ["hebrew-calendar", "intention", "now-next"].includes(id))).toBe(true);
  });

  it("is a permutation: nothing lost, nothing duplicated", () => {
    for (const window of Object.keys(CONTEXT_PROFILES) as ContextWindow[]) {
      const result = ids(DEFAULT_LAYOUT, CONTEXT_PROFILES[window].promote);
      expect([...result].sort()).toEqual([...DEFAULT_LAYOUT.order].sort());
    }
  });

  it("changes nothing when nothing promoted is visible, or nothing is promoted", () => {
    expect(ids(DEFAULT_LAYOUT, [])).toEqual(DEFAULT_LAYOUT.order);
    expect(ids(DEFAULT_LAYOUT, ["not-a-widget"])).toEqual(DEFAULT_LAYOUT.order);
  });

  it("respects spans-only customisation (order untouched)", () => {
    const layout = normalizeLayout({ ...DEFAULT_LAYOUT, spans: { goals: 2 } });
    expect(ids(layout, [])).toEqual(layout.order);
  });
});

describe("intensityHint", () => {
  const curve = energyCurve();
  it("speaks to each intensity", () => {
    expect(intensityHint(energyGuidance(curve, clock(11)))).toContain("התובענית");
    expect(intensityHint(energyGuidance(curve, clock(14, 30)))).toContain("קלות");
    expect(intensityHint(energyGuidance(curve, clock(3)))).toContain("מנוחה");
  });
});

describe("parseContextPreference", () => {
  it("is on by default, and only a clear 'off' turns it off", () => {
    expect(parseContextPreference(null)).toEqual({ enabled: true });
    expect(parseContextPreference(undefined)).toEqual({ enabled: true });
    expect(parseContextPreference("garbage")).toEqual({ enabled: true });
    expect(parseContextPreference({})).toEqual({ enabled: true });
    expect(parseContextPreference({ enabled: "no" })).toEqual({ enabled: true });
    expect(parseContextPreference({ enabled: true })).toEqual({ enabled: true });
    expect(parseContextPreference({ enabled: false })).toEqual({ enabled: false });
  });
});

describe("parseContextOverride", () => {
  it("reads a valid HH:MM", () => {
    expect(parseContextOverride("?contextAt=09:50")).toEqual({ hour: 9, minute: 50 });
    expect(parseContextOverride("?a=1&contextAt=7:05")).toEqual({ hour: 7, minute: 5 });
    expect(parseContextOverride("?contextAt=00:00")).toEqual({ hour: 0, minute: 0 });
    expect(parseContextOverride("?contextAt=23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("ignores anything else", () => {
    for (const search of ["", "?", "?contextAt=", "?contextAt=24:00", "?contextAt=12:60", "?contextAt=noon", "?contextAt=9", "?other=09:50"]) {
      expect(parseContextOverride(search), search).toBeNull();
    }
  });
});
