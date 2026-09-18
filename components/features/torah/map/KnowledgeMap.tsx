"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Eye,
  GraduationCap,
  Headphones,
  Lightbulb,
  ListTree,
  Loader2,
  Maximize,
  Mic,
  Minus,
  Network,
  Plus,
  Search,
  SlidersHorizontal,
  Swords,
  X,
  type LucideIcon,
} from "lucide-react";
import { SectionPlaceholder } from "@/components/features/torah/hub/PageSection";
import { AudioAttachmentWidget } from "@/components/features/torah/attachments/AudioAttachmentWidget";
import {
  EDGE_KIND_LABELS,
  ERA_LABELS,
  NODE_TYPE_LABELS,
  NODE_TYPE_SINGULAR,
  capMapGraph,
  connectionLabel,
  filterMapGraph,
  mapCategories,
  mapEras,
  nodeConnections,
  searchMapNodes,
  type EraBucket,
  type MapEdgeKind,
  type MapGraph,
  type MapNode,
  type MapNodeType,
} from "@/lib/torah/graphMap";
import {
  fitCamera,
  focusCamera,
  forceLayout,
  lerpCamera,
  zoomAt,
  type Camera,
  type Point,
} from "@/lib/torah/graphLayout";
import { cn } from "@/lib/utils";

/** More than this and the force layout starts to cost a visible frame budget. */
const MAX_NODES = 300;
const FOCUS_SCALE = 1.5;

const NODE_STYLE: Record<MapNodeType, { color: string; soft: string; icon: LucideIcon }> = {
  book: { color: "var(--accent-knowledge)", soft: "bg-accent-knowledge/12 text-accent-knowledge", icon: BookOpen },
  rabbi: { color: "var(--gold)", soft: "bg-gold-soft text-gold-ink", icon: GraduationCap },
  lesson: { color: "var(--accent-health)", soft: "bg-accent-health/12 text-accent-health", icon: Headphones },
  concept: { color: "var(--accent-career)", soft: "bg-accent-career/12 text-accent-career", icon: Lightbulb },
};

const EDGE_COLOR: Record<MapEdgeKind, string> = {
  authored_by: "var(--gold)",
  cites: "var(--accent-knowledge)",
  student_of: "var(--accent-family)",
  given_by: "var(--accent-health)",
  related_concept: "var(--accent-career)",
};

const NODE_TYPES: MapNodeType[] = ["book", "rabbi", "lesson", "concept"];
const EDGE_KINDS: MapEdgeKind[] = ["authored_by", "cites", "student_of", "given_by", "related_concept"];

function radiusFor(node: MapNode): number {
  return 15 + Math.min(node.degree, 10) * 1.6;
}

function toggle<T>(set: ReadonlySet<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * מפת הקשרים — the learner's Torah library as an interactive graph.
 *
 * The layout is computed ONCE per data load, over every node, and filters
 * only hide: a node never jumps when a filter changes, so the learner's
 * spatial memory of their map survives exploring it.
 */
export function KnowledgeMap() {
  const router = useRouter();
  const params = useSearchParams();
  const reduceMotion = useReducedMotion();

  const [data, setData] = useState<MapGraph | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [types, setTypes] = useState<Set<MapNodeType>>(new Set());
  const [eras, setEras] = useState<Set<EraBucket>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [edgeKinds, setEdgeKinds] = useState<Set<MapEdgeKind>>(new Set());
  const [hideIsolated, setHideIsolated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("preview");

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [viewport, setViewport] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<Camera>({ x: 400, y: 300, scale: 1 });
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  const animation = useRef<number | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/torah/graph", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as MapGraph;
      })
      .then((graph) => {
        if (!cancelled) setData(graph);
      })
      .catch(() => {
        if (!cancelled) setLoadError("טעינת המפה נכשלה. נסה לרענן.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { graph: full, hidden } = useMemo(
    () => (data ? capMapGraph(data, MAX_NODES) : { graph: { nodes: [], edges: [] } as MapGraph, hidden: 0 }),
    [data]
  );

  const positions = useMemo(
    () =>
      forceLayout(
        full.nodes.map((n) => ({ key: n.key, degree: n.degree })),
        full.edges.map((e) => ({ from: e.from, to: e.to, weight: e.weight })),
        // The box grows with the library. A small graph gets a small box, so
        // fitting it to the canvas lands near 1:1 instead of zoomed far out.
        { width: Math.max(520, Math.sqrt(full.nodes.length) * 170), height: Math.max(360, Math.sqrt(full.nodes.length) * 130) }
      ),
    [full]
  );

  const visible = useMemo(
    () => filterMapGraph(full, { types, eras, categories, edgeKinds, hideIsolated }),
    [full, types, eras, categories, edgeKinds, hideIsolated]
  );
  const visibleKeys = useMemo(() => new Set(visible.nodes.map((n) => n.key)), [visible]);
  const nodeByKey = useMemo(() => new Map(full.nodes.map((n) => [n.key, n])), [full]);

  const availableEras = useMemo(() => mapEras(full), [full]);
  const availableCategories = useMemo(() => mapCategories(full), [full]);
  const typeCounts = useMemo(() => {
    const counts: Record<MapNodeType, number> = { book: 0, rabbi: 0, lesson: 0, concept: 0 };
    for (const n of full.nodes) counts[n.type]++;
    return counts;
  }, [full]);

  // ---- viewport & camera ---------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setViewport({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [data]);

  const animateTo = useCallback(
    (target: Camera) => {
      if (animation.current) cancelAnimationFrame(animation.current);
      if (reduceMotion) {
        setCamera(target);
        return;
      }
      const from = cameraRef.current;
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / 550);
        setCamera(lerpCamera(from, target, t));
        if (t < 1) animation.current = requestAnimationFrame(step);
        else animation.current = null;
      };
      animation.current = requestAnimationFrame(step);
    },
    [reduceMotion]
  );

  const fitAll = useCallback(
    (animate = true) => {
      const points = visible.nodes.map((n) => positions.get(n.key)).filter((p): p is Point => Boolean(p));
      const target = fitCamera(points, viewport, 70);
      if (animate) animateTo(target);
      else setCamera(target);
    },
    [visible, positions, viewport, animateTo]
  );

  const focusNode = useCallback(
    (key: string) => {
      const point = positions.get(key);
      if (!point) return;
      setSelected(key);
      setInspectorTab("preview");
      animateTo(focusCamera(point, viewport, Math.max(cameraRef.current.scale, FOCUS_SCALE)));
    },
    [positions, viewport, animateTo]
  );

  // First fit once the data and the real viewport size are both known; then a
  // ?focus=book:<id> deep link centres its node.
  useEffect(() => {
    if (!data || fitted.current || viewport.width === 800) return;
    fitted.current = true;
    const focus = params.get("focus");
    if (focus && positions.has(focus)) {
      fitAll(false);
      setTimeout(() => focusNode(focus), 150);
    } else {
      fitAll(false);
    }
  }, [data, viewport, params, positions, fitAll, focusNode]);

  useEffect(() => () => {
    if (animation.current) cancelAnimationFrame(animation.current);
  }, []);

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (animation.current) cancelAnimationFrame(animation.current);
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015));
      setCamera((c) => zoomAt(c, { x: event.clientX - rect.left, y: event.clientY - rect.top }, factor));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [data]);

  // "/" focuses search, Escape closes the inspector.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape" && !typing) {
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- pan & pinch -----------------------------------------------------------

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ moved: boolean; pinchDistance: number | null }>({ moved: false, pinchDistance: null });

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-node]")) return;
    if (animation.current) cancelAnimationFrame(animation.current);
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = { moved: false, pinchDistance: null };
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const current = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, current);

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = event.currentTarget.getBoundingClientRect();
      const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
      if (gesture.current.pinchDistance) {
        const factor = distance / gesture.current.pinchDistance;
        setCamera((c) => zoomAt(c, mid, factor));
      }
      gesture.current.pinchDistance = distance;
      gesture.current.moved = true;
      return;
    }

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      gesture.current.moved = gesture.current.moved || Math.abs(dx) + Math.abs(dy) > 2;
      setCamera((c) => ({ ...c, x: c.x + dx, y: c.y + dy }));
    }
  }

  function onPointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const wasPointer = pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) gesture.current.pinchDistance = null;
    if (wasPointer && pointers.current.size === 0 && !gesture.current.moved) setSelected(null);
  }

  function zoomButton(factor: number) {
    animateTo(zoomAt(cameraRef.current, { x: viewport.width / 2, y: viewport.height / 2 }, factor));
  }

  // ---- search ---------------------------------------------------------------

  const results = useMemo(() => searchMapNodes(full.nodes, query, 8), [full, query]);

  function chooseResult(node: MapNode) {
    // A search result hidden by a filter is still where the learner asked to go.
    if (!visibleKeys.has(node.key)) {
      setTypes(new Set());
      setEras(new Set());
      setCategories(new Set());
      setEdgeKinds(new Set());
      setHideIsolated(false);
    }
    setQuery("");
    setSearchOpen(false);
    searchRef.current?.blur();
    focusNode(node.key);
  }

  // ---- highlight --------------------------------------------------------------

  const emphasis = hovered ?? selected;
  const neighbourhood = useMemo(() => {
    if (!emphasis) return null;
    const keys = new Set([emphasis]);
    for (const e of visible.edges) {
      if (e.from === emphasis) keys.add(e.to);
      if (e.to === emphasis) keys.add(e.from);
    }
    return keys;
  }, [emphasis, visible]);

  const selectedNode = selected ? nodeByKey.get(selected) ?? null : null;
  const connections = useMemo(() => (selected ? nodeConnections(visible, selected) : []), [visible, selected]);
  const filtersActive = types.size + eras.size + categories.size + edgeKinds.size > 0 || hideIsolated;

  // ---- render -----------------------------------------------------------------

  if (loadError) {
    return (
      <main className="min-h-screen px-4 py-10 sm:px-10">
        <SectionPlaceholder icon={Network} title="המפה לא נטענה" body={loadError} />
      </main>
    );
  }

  // Labels are hidden only when there are too many to read at once — a small
  // map keeps every name visible however far out the camera sits.
  const showLabels = camera.scale >= 0.6 || visible.nodes.length <= 60;
  // Roughly constant on screen: world font size is divided by the zoom.
  const labelSize = Math.min(30, 12 / Math.max(0.4, Math.min(camera.scale, 1.4)));

  return (
    <main className="flex min-h-screen flex-col px-4 py-6 sm:px-8 lg:px-12">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link
            href="/areas/torah"
            className="focus-ring glass-control-hover -ms-2.5 inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
          >
            <ArrowRight size={14} aria-hidden />
            מרחב תורה
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
            <Network size={22} className="text-gold-ink" aria-hidden />
            מפת הקשרים
          </h1>
          <p className="text-sm text-muted">ספרים, רבנים, שיעורים ומושגים — וכל מה שמחבר ביניהם.</p>
        </div>

        <div className="relative w-full sm:w-80">
          <label className="flex items-center gap-2 rounded-2xl border border-hairline-card bg-surface px-3 py-2 focus-within:border-gold-line">
            <Search size={15} className="text-muted" aria-hidden />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
                setActiveResult(0);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActiveResult((i) => Math.min(results.length - 1, i + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActiveResult((i) => Math.max(0, i - 1));
                } else if (e.key === "Enter" && results[activeResult]) {
                  e.preventDefault();
                  chooseResult(results[activeResult]);
                } else if (e.key === "Escape") {
                  setQuery("");
                  searchRef.current?.blur();
                }
              }}
              role="combobox"
              aria-expanded={searchOpen && results.length > 0}
              aria-controls="map-search-results"
              aria-activedescendant={results[activeResult] ? `map-result-${activeResult}` : undefined}
              placeholder="חפש ספר, רב, שיעור או מושג…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
            <kbd className="hidden rounded border border-hairline-card px-1.5 text-[0.65rem] text-muted sm:inline">/</kbd>
          </label>
          {searchOpen && query.trim() && (
            <ul
              id="map-search-results"
              role="listbox"
              className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-hairline-card bg-surface py-1 shadow-xl"
            >
              {results.length === 0 && <li className="px-3.5 py-2.5 text-xs text-muted">לא נמצא במפה.</li>}
              {results.map((node, index) => {
                const Icon = NODE_STYLE[node.type].icon;
                return (
                  <li
                    key={node.key}
                    id={`map-result-${index}`}
                    role="option"
                    aria-selected={index === activeResult}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      chooseResult(node);
                    }}
                    onMouseEnter={() => setActiveResult(index)}
                    className={cn("flex cursor-pointer items-center gap-2.5 px-3 py-2", index === activeResult && "bg-fill-subtle")}
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", NODE_STYLE[node.type].soft)} aria-hidden>
                      <Icon size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">{node.label}</span>
                      <span className="block truncate text-[0.7rem] text-muted">
                        {NODE_TYPE_LABELS[node.type]}
                        {node.sublabel ? ` · ${node.sublabel}` : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {!data ? (
        <p className="flex flex-1 items-center justify-center gap-2 py-24 text-sm text-muted" role="status">
          <Loader2 size={16} className="animate-spin" aria-hidden />
          בונה את המפה…
        </p>
      ) : full.nodes.length === 0 ? (
        <SectionPlaceholder
          icon={Network}
          title="המפה עוד ריקה"
          body="הוסף ספרים, רבנים ושיעורים למרחב התורה — וכל קשר ביניהם יופיע כאן."
        />
      ) : (
        <div className="flex flex-1 flex-col gap-4 lg:flex-row">
          {/* Filters */}
          <aside className="lg:w-64 lg:shrink-0" aria-label="סינון המפה">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className="focus-ring mb-2 inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs font-medium text-foreground/85 lg:hidden"
            >
              <SlidersHorizontal size={13} aria-hidden />
              סינון{filtersActive ? " (פעיל)" : ""}
            </button>
            <div className={cn("glass-card flex-col gap-4 rounded-2xl p-4", filtersOpen ? "flex" : "hidden lg:flex")}>
              <FilterGroup title="סוג">
                {NODE_TYPES.filter((t) => typeCounts[t] > 0).map((type) => (
                  <Chip key={type} active={types.has(type)} onClick={() => setTypes((s) => toggle(s, type))} dot={NODE_STYLE[type].color}>
                    {NODE_TYPE_LABELS[type]} <span className="text-muted">{typeCounts[type]}</span>
                  </Chip>
                ))}
              </FilterGroup>

              {availableEras.length > 0 && (
                <FilterGroup title="תקופה">
                  {availableEras.map((era) => (
                    <Chip key={era} active={eras.has(era)} onClick={() => setEras((s) => toggle(s, era))}>
                      {ERA_LABELS[era]}
                    </Chip>
                  ))}
                </FilterGroup>
              )}

              {availableCategories.length > 0 && (
                <FilterGroup title="קטגוריית ספר">
                  {availableCategories.map((category) => (
                    <Chip key={category || "none"} active={categories.has(category)} onClick={() => setCategories((s) => toggle(s, category))}>
                      {category || "ללא קטגוריה"}
                    </Chip>
                  ))}
                </FilterGroup>
              )}

              <FilterGroup title="סוג קשר">
                {EDGE_KINDS.filter((kind) => full.edges.some((e) => e.kind === kind)).map((kind) => (
                  <Chip key={kind} active={edgeKinds.has(kind)} onClick={() => setEdgeKinds((s) => toggle(s, kind))} dot={EDGE_COLOR[kind]} line>
                    {EDGE_KIND_LABELS[kind]}
                  </Chip>
                ))}
                {full.edges.length === 0 && <p className="text-xs text-muted">עוד אין קשרים במפה.</p>}
              </FilterGroup>

              <label className="flex cursor-pointer items-center gap-2 text-xs text-foreground/85">
                <input
                  type="checkbox"
                  checked={hideIsolated}
                  onChange={(e) => setHideIsolated(e.target.checked)}
                  className="size-3.5 accent-[var(--gold)]"
                />
                הסתר פריטים ללא קשרים
              </label>

              {filtersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setTypes(new Set());
                    setEras(new Set());
                    setCategories(new Set());
                    setEdgeKinds(new Set());
                    setHideIsolated(false);
                  }}
                  className="focus-ring w-fit text-xs text-gold-ink hover:underline"
                >
                  נקה סינון
                </button>
              )}

              <div className="flex flex-col gap-1.5 border-t border-hairline-card pt-3 text-[0.7rem] text-muted">
                <span className="flex items-center gap-2">
                  <svg width="26" height="6" aria-hidden>
                    <line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                  קשר שהוזן או יובא ממקור
                </span>
                <span className="flex items-center gap-2">
                  <svg width="26" height="6" aria-hidden>
                    <line x1="0" y1="3" x2="26" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray="4 3" />
                  </svg>
                  קשר משוער (AI)
                </span>
                {hidden > 0 && <span>מוצגים {MAX_NODES} הפריטים המקושרים ביותר ({hidden} מוסתרים).</span>}
              </div>
            </div>
          </aside>

          {/* Canvas */}
          <div
            ref={containerRef}
            className="glass-card relative min-h-[28rem] flex-1 overflow-hidden rounded-2xl lg:min-h-[calc(100vh-12rem)]"
          >
            <svg
              ref={svgRef}
              width={viewport.width}
              height={viewport.height}
              className="absolute inset-0 size-full cursor-grab touch-none select-none active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              role="img"
              aria-label={`מפת קשרים עם ${visible.nodes.length} פריטים ו־${visible.edges.length} קשרים`}
            >
              <defs>
                {EDGE_KINDS.map((kind) => (
                  <marker
                    key={kind}
                    id={`arrow-${kind}`}
                    viewBox="0 0 10 10"
                    refX="9"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0,0 L10,5 L0,10 z" style={{ fill: EDGE_COLOR[kind] }} />
                  </marker>
                ))}
              </defs>
              <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.scale})`}>
                {visible.edges.map((edge) => {
                  const a = positions.get(edge.from);
                  const b = positions.get(edge.to);
                  const target = nodeByKey.get(edge.to);
                  if (!a || !b || !target) return null;
                  const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                  const inset = radiusFor(target) + 4;
                  const end = { x: b.x - ((b.x - a.x) / dist) * inset, y: b.y - ((b.y - a.y) / dist) * inset };
                  const dim = neighbourhood && !(neighbourhood.has(edge.from) && neighbourhood.has(edge.to) && (edge.from === emphasis || edge.to === emphasis));
                  return (
                    <line
                      key={edge.id}
                      x1={a.x}
                      y1={a.y}
                      x2={end.x}
                      y2={end.y}
                      style={{ stroke: EDGE_COLOR[edge.kind] }}
                      strokeWidth={(edge.origin === "ai" ? 1.4 : 2) / Math.max(0.6, camera.scale)}
                      strokeDasharray={edge.origin === "ai" ? "6 4" : undefined}
                      strokeOpacity={dim ? 0.12 : 0.35 + 0.55 * edge.weight}
                      markerEnd={`url(#arrow-${edge.kind})`}
                      className="transition-[stroke-opacity] duration-200"
                    />
                  );
                })}

                {visible.nodes.map((node) => {
                  const p = positions.get(node.key);
                  if (!p) return null;
                  const r = radiusFor(node);
                  const style = NODE_STYLE[node.type];
                  const Icon = style.icon;
                  const isSelected = node.key === selected;
                  const dim = neighbourhood && !neighbourhood.has(node.key);
                  const labelled = showLabels || isSelected || node.key === hovered || node.degree >= 4;
                  return (
                    <g
                      key={node.key}
                      data-node
                      transform={`translate(${p.x} ${p.y})`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${NODE_TYPE_LABELS[node.type]}: ${node.label}`}
                      aria-pressed={isSelected}
                      onClick={() => {
                        setSelected(node.key);
                        setInspectorTab("preview");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          focusNode(node.key);
                        }
                      }}
                      onPointerEnter={() => setHovered(node.key)}
                      onPointerLeave={() => setHovered((h) => (h === node.key ? null : h))}
                      className="cursor-pointer outline-none"
                      style={{ opacity: dim ? 0.25 : 1, transition: "opacity 200ms" }}
                    >
                      {isSelected && <circle r={r + 7} style={{ fill: "none", stroke: style.color }} strokeWidth={2} strokeOpacity={0.5} />}
                      <circle r={r} style={{ fill: "var(--surface)", stroke: style.color }} strokeWidth={isSelected ? 3 : 2} />
                      <circle r={r - 3} style={{ fill: style.color }} fillOpacity={0.14} />
                      <Icon x={-8} y={-8} width={16} height={16} style={{ color: style.color }} aria-hidden />
                      {labelled && (
                        <text
                          y={r + labelSize + 3}
                          textAnchor="middle"
                          className="pointer-events-none"
                          style={{
                            fill: "var(--foreground)",
                            fontSize: labelSize,
                            fontWeight: isSelected ? 600 : 500,
                            paintOrder: "stroke",
                            stroke: "var(--background)",
                            strokeWidth: labelSize / 4,
                            strokeLinejoin: "round",
                          }}
                        >
                          {node.label.length > 26 ? `${node.label.slice(0, 25)}…` : node.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>

            {visible.nodes.length === 0 && (
              <p className="absolute inset-0 grid place-items-center text-sm text-muted">אין פריטים שמתאימים לסינון.</p>
            )}

            <div className="absolute bottom-3 start-3 flex flex-col gap-1 rounded-xl border border-hairline-card bg-surface/90 p-1 backdrop-blur">
              <IconButton label="התקרב" onClick={() => zoomButton(1.3)} icon={Plus} />
              <IconButton label="התרחק" onClick={() => zoomButton(1 / 1.3)} icon={Minus} />
              <IconButton label="הצג הכל" onClick={() => fitAll()} icon={Maximize} />
            </div>
            <p className="pointer-events-none absolute bottom-3 end-3 hidden text-[0.7rem] text-muted sm:block">
              גרור להזזה · גלגלת להגדלה · לחיצה על פריט לפרטים
            </p>

            <AnimatePresence>
              {selectedNode && (
                <motion.aside
                  key="inspector"
                  initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, x: 24 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="absolute inset-x-2 bottom-2 z-20 flex max-h-[70%] flex-col overflow-hidden rounded-2xl border border-hairline-card bg-surface shadow-2xl sm:inset-x-auto sm:inset-y-3 sm:end-3 sm:max-h-none sm:w-80"
                  aria-label={`פרטים: ${selectedNode.label}`}
                >
                  <Inspector
                    node={selectedNode}
                    tab={inspectorTab}
                    onTab={setInspectorTab}
                    connections={connections}
                    onClose={() => setSelected(null)}
                    onFocus={focusNode}
                    onOpen={() => selectedNode.href && router.push(selectedNode.href)}
                  />
                </motion.aside>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </main>
  );
}

type InspectorTab = "preview" | "details" | "audio";

function Inspector({
  node,
  tab,
  onTab,
  connections,
  onClose,
  onFocus,
  onOpen,
}: {
  node: MapNode;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  connections: ReturnType<typeof nodeConnections>;
  onClose: () => void;
  onFocus: (key: string) => void;
  onOpen: () => void;
}) {
  const style = NODE_STYLE[node.type];
  const Icon = style.icon;
  const havrutaHref = `/areas/torah/havruta?type=${node.type}&id=${encodeURIComponent(node.id)}&mode=debate`;

  return (
    <>
      <header className="flex items-start gap-3 border-b border-hairline-card p-4">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", style.soft)} aria-hidden>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-medium text-muted">{NODE_TYPE_SINGULAR[node.type]}</p>
          <h2 className="text-base font-semibold leading-snug text-foreground">{node.label}</h2>
          {node.sublabel && <p className="text-xs text-muted">{node.sublabel}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {node.era && node.era !== "unknown" && (
              <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-foreground/75">{ERA_LABELS[node.era]}</span>
            )}
            {node.category && <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-foreground/75">{node.category}</span>}
            <span className="rounded-full bg-fill-subtle px-2 py-0.5 text-[0.65rem] text-foreground/75">{node.degree} קשרים</span>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
          <X size={16} aria-hidden />
        </button>
      </header>

      <div role="tablist" aria-label="תצוגה" className="flex gap-1 px-4 pt-3">
        {(
          [
            { key: "preview", label: "תצוגה מקדימה", icon: Eye },
            { key: "details", label: "קשרים", icon: ListTree },
            // Concepts have no page of their own yet, so the map is where a
            // recording gets attached to one — and the same tab works for the
            // other kinds without sending the learner to their page first.
            { key: "audio", label: "הקלטות", icon: Mic },
          ] as const
        ).map(({ key, label, icon: TabIcon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => onTab(key)}
            className={cn(
              "focus-ring flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors",
              tab === key ? "bg-foreground text-background" : "bg-fill-subtle text-muted hover:text-foreground"
            )}
          >
            <TabIcon size={12} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "audio" ? (
          <AudioAttachmentWidget entityType={node.type} entityId={node.id} entityLabel={node.label} compact />
        ) : tab === "preview" ? (
          node.preview ? (
            <p className="text-sm leading-relaxed text-foreground/85">{node.preview}</p>
          ) : (
            <p className="text-xs text-muted">עוד אין תיאור. פתח את העמוד כדי להעשיר אותו.</p>
          )
        ) : connections.length === 0 ? (
          <p className="text-xs text-muted">אין קשרים גלויים לפריט הזה בסינון הנוכחי.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {connections.map(({ node: other, edge, outgoing }) => {
              const OtherIcon = NODE_STYLE[other.type].icon;
              return (
                <li key={edge.id}>
                  <button
                    type="button"
                    onClick={() => onFocus(other.key)}
                    className="focus-ring flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-start transition-colors hover:bg-fill-subtle"
                  >
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", NODE_STYLE[other.type].soft)} aria-hidden>
                      <OtherIcon size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.7rem] text-muted">
                        {connectionLabel(edge.kind, outgoing)}
                        {edge.origin === "ai" && ` · משוער ${Math.round(edge.weight * 100)}%`}
                      </span>
                      <span className="block truncate text-sm text-foreground">{other.label}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap gap-2 border-t border-hairline-card p-3">
        {node.href && (
          <button
            type="button"
            onClick={onOpen}
            className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-hairline-card bg-surface px-3 py-1.5 text-xs font-medium text-foreground/85 hover:border-gold-line"
          >
            <ExternalLink size={13} aria-hidden />
            פתח עמוד
          </button>
        )}
        <Link
          href={havrutaHref}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-medium text-white"
        >
          <Swords size={13} aria-hidden />
          חברותא AI על {node.type === "rabbi" ? "שיטתו" : "זה"}
        </Link>
      </footer>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-medium text-muted">{title}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

function Chip({
  active,
  onClick,
  children,
  dot,
  line,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dot?: string;
  line?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-gold-line bg-gold-soft text-foreground" : "border-hairline-card bg-surface text-foreground/80 hover:border-gold-line"
      )}
    >
      {dot &&
        (line ? (
          <span className="h-0.5 w-3 rounded-full" style={{ background: dot }} aria-hidden />
        ) : (
          <span className="size-2 rounded-full" style={{ background: dot }} aria-hidden />
        ))}
      {children}
    </button>
  );
}

function IconButton({ label, onClick, icon: Icon }: { label: string; onClick: () => void; icon: LucideIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="focus-ring grid size-8 place-items-center rounded-lg text-foreground/80 transition-colors hover:bg-fill-subtle hover:text-foreground"
    >
      <Icon size={15} aria-hidden />
    </button>
  );
}
