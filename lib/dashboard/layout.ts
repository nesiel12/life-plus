// The customisable dashboard: which widgets, in what order, at what width.
//
// Pure, because the interesting part is not dragging — it is what happens to
// a layout someone saved months ago when the app has changed underneath it.
// A stored order that is trusted blindly will hide every widget added since,
// forever, and crash or render holes for every widget removed. That
// reconciliation is the whole job of this module, and it is testable without
// a DOM.

export type WidgetSpan = 1 | 2 | 3;

export interface WidgetDefinition {
  id: string;
  /** Shown in the edit-mode chrome and the hidden-widget tray. */
  title: string;
  defaultSpan: WidgetSpan;
  /** Below this the widget's content stops being readable. */
  minSpan: WidgetSpan;
  /** Hidden unless the user turns it on. */
  optional?: boolean;
}

export interface DashboardLayout {
  /** Widget ids, in display order. */
  order: string[];
  /** Ids the user has taken off the dashboard. */
  hidden: string[];
  /** Per-widget width in grid columns. Absent = the widget's default. */
  spans: Record<string, WidgetSpan>;
}

export const MAX_SPAN: WidgetSpan = 3;

/** The dashboard as shipped. Order here is the default order. */
export const WIDGETS: WidgetDefinition[] = [
  // Leads everything: the fastest path from "I need to remember this" to
  // it being captured, replacing a dozen separate add-forms.
  { id: "command-bar", title: "שורת פקודה", defaultSpan: 2, minSpan: 2 },
  // Then: "where am I in my day" is the question the dashboard
  // is opened to answer, and it is the one thing here that changes by the
  // hour rather than by the day.
  { id: "now-next", title: "עכשיו והבא", defaultSpan: 1, minSpan: 1 },
  { id: "ai-briefing", title: "תדריך AI", defaultSpan: 2, minSpan: 2 },
  { id: "today-structure", title: "מבנה היום", defaultSpan: 1, minSpan: 1 },
  { id: "hebrew-calendar", title: "לוח עברי", defaultSpan: 1, minSpan: 1 },
  { id: "motivation", title: "השראה יומית", defaultSpan: 1, minSpan: 1 },
  { id: "intention", title: "כוונת היום", defaultSpan: 1, minSpan: 1 },
  { id: "upcoming-moments", title: "רגעים משמעותיים", defaultSpan: 2, minSpan: 1 },
  { id: "recent-activity", title: "פעילות אחרונה", defaultSpan: 1, minSpan: 1 },
  { id: "memories", title: "זיכרונות", defaultSpan: 3, minSpan: 2 },
  { id: "goals", title: "מטרות", defaultSpan: 3, minSpan: 2 },
];

const BY_ID = new Map(WIDGETS.map((w) => [w.id, w]));

export function widgetById(id: string): WidgetDefinition | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_LAYOUT: DashboardLayout = {
  order: WIDGETS.map((w) => w.id),
  hidden: WIDGETS.filter((w) => w.optional).map((w) => w.id),
  spans: {},
};

function clampSpan(span: number, definition: WidgetDefinition): WidgetSpan {
  const rounded = Math.round(span);
  if (!Number.isFinite(rounded)) return definition.defaultSpan;
  return Math.min(MAX_SPAN, Math.max(definition.minSpan, rounded)) as WidgetSpan;
}

/**
 * Reconciles a stored layout against the widgets that actually exist.
 *
 * Four things go wrong with a persisted layout and all four are handled here:
 * a widget the app no longer ships (dropped), a widget added since the layout
 * was saved (appended in its shipped position, visible — a new feature that
 * silently never appears is indistinguishable from a broken one), a duplicate
 * id (kept once), and a span that is out of range or below what the widget
 * needs to be readable (clamped).
 *
 * Anything unparseable falls back to the default rather than throwing. A
 * corrupt layout should cost the user their arrangement, not their dashboard.
 */
export function normalizeLayout(stored: unknown): DashboardLayout {
  if (!stored || typeof stored !== "object") return DEFAULT_LAYOUT;

  const raw = stored as Partial<DashboardLayout>;
  const known = new Set(WIDGETS.map((w) => w.id));

  const seen = new Set<string>();
  const order: string[] = [];
  for (const id of Array.isArray(raw.order) ? raw.order : []) {
    if (typeof id !== "string" || !known.has(id) || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }

  // Widgets the stored layout has never heard of, in their shipped position.
  for (const widget of WIDGETS) {
    if (!seen.has(widget.id)) order.push(widget.id);
  }

  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : []).filter(
    (id): id is string => typeof id === "string" && known.has(id)
  );

  const spans: Record<string, WidgetSpan> = {};
  const rawSpans = raw.spans && typeof raw.spans === "object" ? raw.spans : {};
  for (const [id, value] of Object.entries(rawSpans)) {
    const definition = BY_ID.get(id);
    if (!definition || typeof value !== "number") continue;
    spans[id] = clampSpan(value, definition);
  }

  return { order, hidden: [...new Set(hidden)], spans };
}

/** The widget's effective width. */
export function spanOf(layout: DashboardLayout, id: string): WidgetSpan {
  const definition = BY_ID.get(id);
  if (!definition) return 1;
  const stored = layout.spans[id];
  return stored ? clampSpan(stored, definition) : definition.defaultSpan;
}

export function isHidden(layout: DashboardLayout, id: string): boolean {
  return layout.hidden.includes(id);
}

/** Visible widgets, in order. */
export function visibleWidgets(layout: DashboardLayout): WidgetDefinition[] {
  return layout.order
    .filter((id) => !layout.hidden.includes(id))
    .map((id) => BY_ID.get(id))
    .filter((w): w is WidgetDefinition => Boolean(w));
}

/** Hidden widgets, for the restore tray. */
export function hiddenWidgets(layout: DashboardLayout): WidgetDefinition[] {
  return layout.order
    .filter((id) => layout.hidden.includes(id))
    .map((id) => BY_ID.get(id))
    .filter((w): w is WidgetDefinition => Boolean(w));
}

/**
 * Moves a widget within the *visible* sequence.
 *
 * Stepping over hidden widgets on purpose: a move that appears to do nothing
 * because an invisible widget absorbed it is the kind of thing that makes
 * people press the button four more times.
 */
export function moveWidget(layout: DashboardLayout, id: string, delta: number): DashboardLayout {
  const visible = layout.order.filter((w) => !layout.hidden.includes(w));
  const from = visible.indexOf(id);
  if (from === -1) return layout;

  const to = from + delta;
  if (to < 0 || to >= visible.length) return layout;

  const reordered = [...visible];
  reordered.splice(from, 1);
  reordered.splice(to, 0, id);

  // Splice the new visible sequence back over the visible slots, leaving the
  // hidden entries where they sit so restoring one puts it back roughly
  // where it was.
  let cursor = 0;
  const order = layout.order.map((w) => (layout.hidden.includes(w) ? w : reordered[cursor++]));
  return { ...layout, order };
}

/** Drops `id` at the position currently held by `targetId`. */
export function moveWidgetTo(layout: DashboardLayout, id: string, targetId: string): DashboardLayout {
  if (id === targetId) return layout;
  const visible = layout.order.filter((w) => !layout.hidden.includes(w));
  const from = visible.indexOf(id);
  const to = visible.indexOf(targetId);
  if (from === -1 || to === -1) return layout;
  return moveWidget(layout, id, to - from);
}

export function setHidden(layout: DashboardLayout, id: string, hidden: boolean): DashboardLayout {
  if (!BY_ID.has(id)) return layout;
  const next = new Set(layout.hidden);
  if (hidden) next.add(id);
  else next.delete(id);
  return { ...layout, hidden: [...next] };
}

/**
 * Cycles a widget's width: min → … → 3 → min.
 *
 * A cycle rather than a slider or a drag handle. There are at most three
 * stops, and a resize handle on a responsive grid promises pixel control the
 * layout cannot honour at any breakpoint but the widest.
 */
export function cycleSpan(layout: DashboardLayout, id: string): DashboardLayout {
  const definition = BY_ID.get(id);
  if (!definition) return layout;
  const current = spanOf(layout, id);
  const next = current >= MAX_SPAN ? definition.minSpan : ((current + 1) as WidgetSpan);
  return { ...layout, spans: { ...layout.spans, [id]: next } };
}

/** True when the layout differs from the shipped default. */
export function isCustomised(layout: DashboardLayout): boolean {
  return (
    layout.hidden.length !== DEFAULT_LAYOUT.hidden.length ||
    Object.keys(layout.spans).length > 0 ||
    layout.order.join() !== DEFAULT_LAYOUT.order.join() ||
    layout.hidden.some((id) => !DEFAULT_LAYOUT.hidden.includes(id))
  );
}
