import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  WIDGETS,
  cycleSpan,
  hiddenWidgets,
  isCustomised,
  isHidden,
  moveWidget,
  moveWidgetTo,
  normalizeLayout,
  setHidden,
  spanOf,
  visibleWidgets,
  widgetById,
  type DashboardLayout,
} from "@/lib/dashboard/layout";

const ALL = WIDGETS.map((w) => w.id);
const A = ALL[0];
const B = ALL[1];
const C = ALL[2];

function layout(overrides: Partial<DashboardLayout> = {}): DashboardLayout {
  return { order: [...ALL], hidden: [], spans: {}, ...overrides };
}

describe("the registry", () => {
  it("has unique ids", () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });

  it("never ships a default span below the widget's own minimum", () => {
    for (const w of WIDGETS) expect(w.defaultSpan).toBeGreaterThanOrEqual(w.minSpan);
  });

  it("resolves a known id and refuses an unknown one", () => {
    expect(widgetById(A)?.id).toBe(A);
    expect(widgetById("nope")).toBeUndefined();
  });
});

describe("normalizeLayout", () => {
  it("falls back to the default for junk", () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout("{}")).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(42)).toEqual(DEFAULT_LAYOUT);
    expect(normalizeLayout(undefined)).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps a stored order", () => {
    const stored = { order: [C, A, B, ...ALL.slice(3)], hidden: [], spans: {} };
    expect(normalizeLayout(stored).order.slice(0, 3)).toEqual([C, A, B]);
  });

  // A widget removed in a new version must not leave a hole.
  it("drops ids the app no longer ships", () => {
    const out = normalizeLayout({ order: ["ghost", ...ALL], hidden: ["ghost"], spans: { ghost: 2 } });
    expect(out.order).not.toContain("ghost");
    expect(out.hidden).not.toContain("ghost");
    expect(out.spans.ghost).toBeUndefined();
  });

  // And a widget added since must not be invisible forever.
  it("appends widgets the stored layout has never heard of", () => {
    const out = normalizeLayout({ order: [A], hidden: [], spans: {} });
    expect(out.order).toHaveLength(ALL.length);
    expect(out.order[0]).toBe(A);
    expect(new Set(out.order)).toEqual(new Set(ALL));
  });

  it("makes a newly added widget visible rather than hidden", () => {
    const out = normalizeLayout({ order: [A], hidden: [], spans: {} });
    expect(out.hidden).toEqual([]);
    expect(visibleWidgets(out).map((w) => w.id)).toContain(B);
  });

  it("keeps a duplicated id only once", () => {
    const out = normalizeLayout({ order: [A, A, B], hidden: [A, A], spans: {} });
    expect(out.order.filter((id) => id === A)).toHaveLength(1);
    expect(out.hidden.filter((id) => id === A)).toHaveLength(1);
  });

  it("ignores non-string ids", () => {
    const out = normalizeLayout({ order: [A, 7, null, B], hidden: [3], spans: {} });
    expect(out.order).toHaveLength(ALL.length);
    expect(out.hidden).toEqual([]);
  });

  describe("spans", () => {
    it("clamps above the maximum", () => {
      expect(normalizeLayout({ order: ALL, hidden: [], spans: { [A]: 9 } }).spans[A]).toBe(3);
    });

    it("clamps below the widget's readable minimum", () => {
      const wide = WIDGETS.find((w) => w.minSpan > 1)!;
      expect(normalizeLayout({ order: ALL, hidden: [], spans: { [wide.id]: 1 } }).spans[wide.id]).toBe(
        wide.minSpan
      );
    });

    it("rounds a fractional span", () => {
      expect(normalizeLayout({ order: ALL, hidden: [], spans: { [A]: 2.4 } }).spans[A]).toBe(2);
    });

    it("ignores a non-numeric span", () => {
      expect(normalizeLayout({ order: ALL, hidden: [], spans: { [A]: "wide" } }).spans[A]).toBeUndefined();
    });

    it("ignores NaN", () => {
      const out = normalizeLayout({ order: ALL, hidden: [], spans: { [A]: NaN } });
      expect(out.spans[A]).toBe(widgetById(A)!.defaultSpan);
    });
  });

  it("is idempotent", () => {
    const once = normalizeLayout({ order: [C, A], hidden: [B], spans: { [A]: 5 } });
    expect(normalizeLayout(once)).toEqual(once);
  });
});

describe("spanOf", () => {
  it("uses the widget's default when nothing is stored", () => {
    expect(spanOf(layout(), A)).toBe(widgetById(A)!.defaultSpan);
  });

  it("uses the stored span when there is one", () => {
    expect(spanOf(layout({ spans: { [A]: 2 } }), A)).toBe(2);
  });

  it("clamps a stored span that is out of range", () => {
    expect(spanOf(layout({ spans: { [A]: 9 as never } }), A)).toBe(3);
  });

  it("is 1 for an unknown widget rather than throwing", () => {
    expect(spanOf(layout(), "ghost")).toBe(1);
  });
});

describe("visibility", () => {
  it("hides and restores a widget", () => {
    const hiddenLayout = setHidden(layout(), A, true);
    expect(isHidden(hiddenLayout, A)).toBe(true);
    expect(visibleWidgets(hiddenLayout).map((w) => w.id)).not.toContain(A);
    expect(hiddenWidgets(hiddenLayout).map((w) => w.id)).toEqual([A]);

    const restored = setHidden(hiddenLayout, A, false);
    expect(isHidden(restored, A)).toBe(false);
  });

  it("keeps a hidden widget in the order, so restoring puts it back in place", () => {
    const out = setHidden(layout(), B, true);
    expect(out.order).toEqual(ALL);
    expect(visibleWidgets(setHidden(out, B, false)).map((w) => w.id)).toEqual(ALL);
  });

  it("ignores an unknown id", () => {
    const before = layout();
    expect(setHidden(before, "ghost", true)).toBe(before);
  });

  it("hiding twice is not a duplicate", () => {
    const out = setHidden(setHidden(layout(), A, true), A, true);
    expect(out.hidden).toEqual([A]);
  });
});

describe("moveWidget", () => {
  it("moves forward and back", () => {
    expect(moveWidget(layout(), A, 1).order.slice(0, 2)).toEqual([B, A]);
    expect(moveWidget(layout(), B, -1).order.slice(0, 2)).toEqual([B, A]);
  });

  it("refuses to move past either end", () => {
    const before = layout();
    expect(moveWidget(before, A, -1)).toBe(before);
    expect(moveWidget(before, ALL[ALL.length - 1], 1)).toBe(before);
  });

  it("ignores an unknown id", () => {
    const before = layout();
    expect(moveWidget(before, "ghost", 1)).toBe(before);
  });

  // A move that appears to do nothing because a hidden widget absorbed it
  // makes people press the button four more times.
  it("steps over a hidden widget", () => {
    const withHidden = setHidden(layout(), B, true);
    const moved = moveWidget(withHidden, A, 1);
    expect(visibleWidgets(moved).map((w) => w.id).slice(0, 2)).toEqual([C, A]);
  });

  it("leaves hidden widgets in their slots", () => {
    const withHidden = setHidden(layout(), B, true);
    const moved = moveWidget(withHidden, A, 1);
    expect(moved.order).toContain(B);
    expect(moved.order).toHaveLength(ALL.length);
  });

  it("cannot move a hidden widget", () => {
    const withHidden = setHidden(layout(), B, true);
    expect(moveWidget(withHidden, B, 1)).toBe(withHidden);
  });

  it("never loses or duplicates a widget", () => {
    const moved = moveWidget(moveWidget(layout(), A, 3), C, -2);
    expect(new Set(moved.order)).toEqual(new Set(ALL));
    expect(moved.order).toHaveLength(ALL.length);
  });
});

describe("moveWidgetTo", () => {
  it("drops a widget at another's position", () => {
    expect(moveWidgetTo(layout(), A, C).order.slice(0, 3)).toEqual([B, C, A]);
  });

  it("is a no-op onto itself", () => {
    const before = layout();
    expect(moveWidgetTo(before, A, A)).toBe(before);
  });

  it("ignores an unknown target", () => {
    const before = layout();
    expect(moveWidgetTo(before, A, "ghost")).toBe(before);
  });

  it("works backwards too", () => {
    expect(moveWidgetTo(layout(), C, A).order.slice(0, 3)).toEqual([C, A, B]);
  });
});

describe("cycleSpan", () => {
  it("steps up and wraps to the widget's minimum", () => {
    const narrow = WIDGETS.find((w) => w.minSpan === 1 && w.defaultSpan === 1)!;
    let current = layout();
    current = cycleSpan(current, narrow.id);
    expect(spanOf(current, narrow.id)).toBe(2);
    current = cycleSpan(current, narrow.id);
    expect(spanOf(current, narrow.id)).toBe(3);
    current = cycleSpan(current, narrow.id);
    expect(spanOf(current, narrow.id)).toBe(1);
  });

  // A widget that needs two columns must never cycle down to one.
  it("wraps to the minimum, not to 1, for a wide widget", () => {
    const wide = WIDGETS.find((w) => w.minSpan > 1)!;
    let current = layout({ spans: { [wide.id]: 3 } });
    current = cycleSpan(current, wide.id);
    expect(spanOf(current, wide.id)).toBe(wide.minSpan);
  });

  it("ignores an unknown id", () => {
    const before = layout();
    expect(cycleSpan(before, "ghost")).toBe(before);
  });
});

describe("isCustomised", () => {
  it("is false for the shipped default", () => {
    expect(isCustomised(DEFAULT_LAYOUT)).toBe(false);
  });

  it("is true after a reorder, a hide, or a resize", () => {
    expect(isCustomised(moveWidget(DEFAULT_LAYOUT, A, 1))).toBe(true);
    expect(isCustomised(setHidden(DEFAULT_LAYOUT, A, true))).toBe(true);
    expect(isCustomised(cycleSpan(DEFAULT_LAYOUT, A))).toBe(true);
  });
});
