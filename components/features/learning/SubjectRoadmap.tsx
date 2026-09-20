"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, Lock, Map as MapIcon, RefreshCw, Sparkles, X } from "lucide-react";
import { ProgressRing } from "@/components/ui/ProgressRing";
import {
  layoutRoadmap,
  nextStep,
  nodeStatus,
  roadmapProgress,
  type NodeStatus,
  type PlacedNode,
  type RoadmapNode,
} from "@/lib/learning/roadmap";
import { cn } from "@/lib/utils";

interface Roadmap {
  topicId: string;
  nodes: RoadmapNode[];
  completed: string[];
}

const STATUS_STYLE: Record<NodeStatus, string> = {
  done: "border-accent-health/50 bg-accent-health/10 shadow-[0_0_22px_-6px_var(--accent-health)]",
  available: "border-gold-line bg-surface shadow-[0_0_0_0_transparent] hover:shadow-[0_0_24px_-6px_var(--gold)]",
  locked: "border-hairline-card bg-surface-sunken/60 opacity-70",
};

const ROW_HEIGHT = 118;
const NODE_HEIGHT = 64;

/**
 * A topic as a node tree: foundations at the top, mastery at the bottom, each
 * step connected to the steps it needs. Done steps glow green, open steps
 * glow gold on hover (and the next one pulses), locked steps wait dimmed.
 * A step opens in place into its card — a shared-layout transition, so it
 * expands out of the node rather than appearing elsewhere.
 */
export function SubjectRoadmap({ topicId, topicTitle }: { topicId: string; topicTitle: string }) {
  const reduceMotion = useReducedMotion();
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [roadmap]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/learning/roadmap?topicId=${topicId}`, { cache: "no-store" });
      const data = await response.json();
      setRoadmap(data.roadmap ?? null);
    } catch {
      setRoadmap(null);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function build(regenerate = false) {
    setBuilding(true);
    setError(null);
    try {
      const response = await fetch("/api/learning/roadmap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId, regenerate }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "בניית מפת הדרכים נכשלה.");
        return;
      }
      setRoadmap(data.roadmap);
      setOpenId(null);
    } catch {
      setError("בניית מפת הדרכים נכשלה. בדוק את החיבור.");
    } finally {
      setBuilding(false);
    }
  }

  async function toggle(nodeId: string, done: boolean) {
    if (!roadmap) return;
    const previous = roadmap;
    const completed = new Set(roadmap.completed);
    if (done) completed.add(nodeId);
    else completed.delete(nodeId);
    setRoadmap({ ...roadmap, completed: [...completed] });
    const response = await fetch("/api/learning/roadmap", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId, nodeId, done }),
    }).catch(() => null);
    if (!response?.ok) {
      setRoadmap(previous);
      setError("העדכון לא נשמר.");
    }
  }

  const completed = useMemo(() => new Set(roadmap?.completed ?? []), [roadmap]);
  const placed = useMemo(() => (roadmap ? layoutRoadmap(roadmap.nodes) : []), [roadmap]);
  const layers = placed.reduce((max, n) => Math.max(max, n.layer + 1), 0);
  const next = roadmap ? nextStep(roadmap.nodes, completed) : null;
  const progress = roadmap ? roadmapProgress(roadmap.nodes, completed) : 0;

  // Node boxes, computed from the container width (RTL: slot 0 on the right).
  const nodeWidth = Math.min(200, Math.max(120, width / 3.4));
  const box = useCallback(
    (node: PlacedNode) => {
      const gap = width / node.layerSize;
      const centerFromRight = gap * (node.slot + 0.5);
      return { x: width - centerFromRight - nodeWidth / 2, y: node.layer * ROW_HEIGHT, cx: width - centerFromRight };
    },
    [width, nodeWidth]
  );
  const byId = new Map(placed.map((n) => [n.id, n]));

  if (loading) {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
        <Loader2 size={15} className="animate-spin" aria-hidden />
        טוען מפת דרכים…
      </p>
    );
  }

  if (!roadmap) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gold-line bg-gold-soft/25 px-5 py-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-gold-soft text-gold-ink" aria-hidden>
          <MapIcon size={22} />
        </span>
        <p className="text-sm font-medium text-foreground">מפת דרכים ל{topicTitle}</p>
        <p className="max-w-sm text-xs text-muted">שלבים מהיסוד ועד שליטה, עם מה שצריך לדעת לפני כל שלב — כדי לדעת תמיד מה הצעד הבא.</p>
        <button
          type="button"
          onClick={() => void build()}
          disabled={building}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-gold px-4 py-1.5 text-xs font-medium text-white disabled:opacity-60"
        >
          {building ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Sparkles size={13} aria-hidden />}
          {building ? "בונה את המפה…" : "בנה מפת דרכים"}
        </button>
        {error && <p className="text-xs text-accent-family">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ProgressRing value={progress} size={54} stroke={5} color="var(--accent-health)" label={`התקדמות ${Math.round(progress * 100)}%`}>
            <span className="ltr text-xs font-semibold tabular-nums text-foreground">{Math.round(progress * 100)}%</span>
          </ProgressRing>
          <div>
            <p className="text-sm font-semibold text-foreground">מפת הדרכים</p>
            <p className="text-xs text-muted">{next ? `הצעד הבא: ${next.title}` : "כל השלבים הושלמו 🎉"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("לבנות את המפה מחדש? הסימונים יתאפסו.")) void build(true);
          }}
          disabled={building}
          className="focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} className={building ? "animate-spin" : undefined} aria-hidden />
          בנה מחדש
        </button>
      </div>

      <LayoutGroup>
        <div ref={container} className="relative w-full" style={{ height: Math.max(1, layers) * ROW_HEIGHT - (ROW_HEIGHT - NODE_HEIGHT) }}>
          {/* Edges: curved paths from each prerequisite down to the step. */}
          <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
            {placed.flatMap((node) =>
              node.dependsOn.map((dep) => {
                const from = byId.get(dep);
                if (!from) return null;
                const a = box(from);
                const b = box(node);
                const y1 = a.y + NODE_HEIGHT;
                const y2 = b.y;
                const mid = (y1 + y2) / 2;
                const lit = completed.has(dep);
                return (
                  <motion.path
                    key={`${dep}-${node.id}`}
                    d={`M${a.cx} ${y1} C${a.cx} ${mid} ${b.cx} ${mid} ${b.cx} ${y2}`}
                    fill="none"
                    strokeWidth={lit ? 2.5 : 1.5}
                    strokeDasharray={lit ? undefined : "5 5"}
                    style={{ stroke: lit ? "var(--accent-health)" : "var(--hairline)" }}
                    initial={reduceMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.7, delay: reduceMotion ? 0 : node.layer * 0.12 }}
                  />
                );
              })
            )}
          </svg>

          {placed.map((node) => {
            const status = nodeStatus(node, completed);
            const { x, y } = box(node);
            const isNext = next?.id === node.id;
            return (
              <motion.button
                key={node.id}
                layoutId={`roadmap-${node.id}`}
                type="button"
                onClick={() => setOpenId(node.id)}
                initial={reduceMotion ? false : { opacity: 0, y: y + 12 }}
                animate={{ opacity: 1, y }}
                transition={{ duration: 0.35, delay: reduceMotion ? 0 : node.layer * 0.1 }}
                whileHover={reduceMotion || status === "locked" ? undefined : { scale: 1.04 }}
                style={{ left: x, width: nodeWidth, height: NODE_HEIGHT, top: 0 }}
                aria-label={`${node.title} — ${status === "done" ? "הושלם" : status === "available" ? "פתוח" : "נעול"}`}
                className={cn(
                  "focus-ring absolute flex items-center gap-2 rounded-2xl border px-3 text-start transition-[box-shadow,opacity]",
                  STATUS_STYLE[status]
                )}
              >
                {isNext && !reduceMotion && (
                  <motion.span
                    aria-hidden
                    className="absolute inset-0 rounded-2xl border-2 border-gold"
                    animate={{ opacity: [0.7, 0], scale: [1, 1.08] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold",
                    status === "done" ? "bg-accent-health text-white" : status === "available" ? "bg-gold-soft text-gold-ink" : "bg-fill text-muted"
                  )}
                  aria-hidden
                >
                  {status === "done" ? <Check size={14} /> : status === "locked" ? <Lock size={12} /> : node.layer + 1}
                </span>
                <span className="line-clamp-2 min-w-0 text-xs font-medium leading-snug text-foreground">{node.title}</span>
              </motion.button>
            );
          })}

          {/* The opened step expands out of its node. */}
          <AnimatePresence>
            {openId && byId.get(openId) && (
              <>
                <motion.div
                  key="scrim"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 rounded-2xl bg-background/60 backdrop-blur-[2px]"
                  onClick={() => setOpenId(null)}
                />
                <RoadmapCard
                  node={byId.get(openId)!}
                  status={nodeStatus(byId.get(openId)!, completed)}
                  prerequisites={byId.get(openId)!.dependsOn.map((d) => byId.get(d)?.title ?? d)}
                  onClose={() => setOpenId(null)}
                  onToggle={(done) => void toggle(openId, done)}
                />
              </>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>
      {error && <p className="text-xs text-accent-family">{error}</p>}
    </div>
  );
}

function RoadmapCard({
  node,
  status,
  prerequisites,
  onClose,
  onToggle,
}: {
  node: PlacedNode;
  status: NodeStatus;
  prerequisites: string[];
  onClose: () => void;
  onToggle: (done: boolean) => void;
}) {
  return (
    <motion.div
      layoutId={`roadmap-${node.id}`}
      role="dialog"
      aria-label={node.title}
      transition={{ type: "spring", visualDuration: 0.35, bounce: 0.1 }}
      className="absolute inset-x-0 top-4 z-20 mx-auto flex w-[min(26rem,100%)] flex-col gap-3 rounded-3xl border border-gold-line bg-surface p-5 shadow-2xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[0.7rem] text-muted">שלב {node.layer + 1}</p>
          <h3 className="text-base font-semibold text-foreground">{node.title}</h3>
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className="focus-ring rounded-lg p-1 text-muted hover:text-foreground">
          <X size={16} aria-hidden />
        </button>
      </div>
      {node.summary && <p className="text-sm leading-relaxed text-foreground/85">{node.summary}</p>}
      {prerequisites.length > 0 && (
        <p className="text-xs text-muted">
          דורש קודם: <span className="text-foreground/80">{prerequisites.join(" · ")}</span>
        </p>
      )}
      {status === "locked" ? (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <Lock size={12} aria-hidden />
          השלב ייפתח כשהשלבים שלפניו יושלמו.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => {
            onToggle(status !== "done");
            onClose();
          }}
          className={cn(
            "focus-ring inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium",
            status === "done" ? "border border-hairline-card text-foreground/80" : "bg-accent-health text-white"
          )}
        >
          <Check size={14} aria-hidden />
          {status === "done" ? "סמן כלא הושלם" : "סמן כהושלם"}
        </button>
      )}
    </motion.div>
  );
}
