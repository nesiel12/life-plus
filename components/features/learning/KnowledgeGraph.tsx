"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Network } from "lucide-react";
import { useLab } from "@/components/features/learning/lab/LabContext";
import { useLabReducedMotion } from "@/components/features/learning/lab/useLabMotion";
import { buildTopicGraph, layoutGraph, type GraphNode } from "@/lib/learning/topicGraph";
import { cn } from "@/lib/utils";
import type { LearningResource, LearningTopic } from "@/types";

interface KnowledgeGraphProps {
  topics: readonly LearningTopic[];
  resources: readonly LearningResource[];
  /** The topic the shuffle is on, or landed on. */
  litId: string | null;
  onOpen: (topicId: string) => void;
}

const NODE_MIN = 46;
const NODE_STEP = 3;
const NODE_MAX_EXTRA = 8;
/** How long the orbital ripple plays before the canvas opens. */
const RIPPLE_MS = 520;

const nodeSize = (node: GraphNode) => NODE_MIN + Math.min(node.resourceCount, NODE_MAX_EXTRA) * NODE_STEP;

/**
 * מפת ידע — the topics as a map, with a line between two only when they are
 * genuinely related (a shared category, or shared terms — see topicGraph.ts), and
 * the reason written on the line.
 *
 * Each node is the topic's card in another shape: it carries the same
 * `layoutId`, so switching from the grid glides the cards across the map. Hover
 * a node and its connections light up and their dashes run; click it and rings
 * ripple out from it before the topic opens.
 *
 * Nodes are placed with left/top percentages rather than transforms so the shared
 * layout animation owns the transform; the connecting lines are a single SVG
 * behind them, in the same 0–100 space.
 */
export function KnowledgeGraph({ topics, resources, litId, onOpen }: KnowledgeGraphProps) {
  const lab = useLab();
  const reduce = useLabReducedMotion();
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [rippleId, setRippleId] = useState<string | null>(null);
  const opening = useRef(false);

  const { nodes, edges } = useMemo(() => {
    const graph = buildTopicGraph(topics, resources);
    return { nodes: layoutGraph(graph.nodes, graph.edges), edges: graph.edges };
  }, [topics, resources]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const titleOf = (id: string) => byId.get(id)?.title ?? "";

  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (hoverId) for (const e of edges) if (e.a === hoverId) set.add(e.b); else if (e.b === hoverId) set.add(e.a);
    return set;
  }, [edges, hoverId]);

  const hoverEdges = hoverId ? edges.filter((e) => e.a === hoverId || e.b === hoverId) : [];
  const focusId = hoverId ?? litId;

  function open(node: GraphNode) {
    if (opening.current) return;
    opening.current = true;
    lab.audio.prime();
    lab.audio.play("pop");
    setRippleId(node.id);
    setTimeout(
      () => {
        opening.current = false;
        setRippleId(null);
        onOpen(node.id);
      },
      reduce ? 0 : RIPPLE_MS
    );
  }

  const rippleNode = rippleId ? byId.get(rippleId) : null;

  return (
    <section aria-label="מפת ידע" className="flex flex-col gap-3">
      <div className="relative aspect-[16/11] min-h-[380px] w-full overflow-hidden rounded-3xl border border-hairline-card bg-surface [background-image:radial-gradient(circle_at_center,color-mix(in_srgb,var(--accent-learning)_7%,transparent),transparent_70%)]">
        {/* The connections. */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          {edges.map((edge) => {
            const a = byId.get(edge.a);
            const b = byId.get(edge.b);
            if (!a || !b) return null;
            const active = hoverId === edge.a || hoverId === edge.b;
            return (
              <motion.line
                key={`${edge.a}|${edge.b}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeDasharray={active ? "7 7" : undefined}
                stroke={active ? "var(--accent-learning)" : "var(--foreground)"}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: active ? 0.95 : focusId ? 0.1 : 0.16 + edge.weight * 0.22,
                  strokeWidth: active ? 2.4 : 1 + edge.weight * 1.4,
                  ...(active && !reduce ? { strokeDashoffset: [0, -28] } : {}),
                }}
                transition={{
                  opacity: { duration: 0.25 },
                  strokeWidth: { duration: 0.25 },
                  strokeDashoffset: { duration: 1.1, repeat: Infinity, ease: "linear" },
                }}
              />
            );
          })}
        </svg>

        {/* The orbital ripple: rings leaving the node that was clicked. */}
        <AnimatePresence>
          {rippleNode && !reduce &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={`ring-${rippleNode.id}-${i}`}
                aria-hidden
                className="pointer-events-none absolute rounded-full border-2 border-accent-learning"
                style={{ left: `${rippleNode.x}%`, top: `${rippleNode.y}%`, width: 60, height: 60, marginLeft: -30, marginTop: -30 }}
                initial={{ scale: 0.6, opacity: 0.8 }}
                animate={{ scale: 3.6, opacity: 0 }}
                transition={{ duration: 0.75, delay: i * 0.12, ease: "easeOut" }}
              />
            ))}
        </AnimatePresence>

        {nodes.map((node, index) => {
          const size = nodeSize(node);
          const related = focusId === null || node.id === focusId || neighbors.has(node.id);
          const lit = node.id === litId;
          return (
            <motion.button
              key={node.id}
              layoutId={`topic-${node.id}`}
              type="button"
              aria-label={`${node.title} — ${Math.round(node.progress * 100)}% הושלם. פתח את הנושא`}
              onClick={() => open(node)}
              onPointerEnter={() => setHoverId(node.id)}
              onPointerLeave={() => setHoverId((cur) => (cur === node.id ? null : cur))}
              onFocus={() => setHoverId(node.id)}
              onBlur={() => setHoverId((cur) => (cur === node.id ? null : cur))}
              transition={{ layout: { type: "spring", bounce: 0.15, duration: 0.6 }, opacity: { duration: 0.2 }, scale: { type: "spring", stiffness: 300, damping: 20 } }}
              initial={{ opacity: 0 }}
              animate={{ opacity: related ? 1 : 0.3, scale: lit ? 1.3 : node.id === hoverId ? 1.12 : 1 }}
              whileTap={reduce ? undefined : { scale: 0.94 }}
              className="focus-ring absolute grid place-items-center rounded-full"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                width: size,
                height: size,
                marginLeft: -size / 2,
                marginTop: -size / 2,
                // The ring is the topic's progress — static paint, drawn once.
                background: `conic-gradient(from 0deg, var(--accent-learning) ${node.progress * 360}deg, color-mix(in srgb, var(--foreground) 12%, transparent) 0)`,
                boxShadow: lit ? "0 0 0 6px color-mix(in srgb, var(--gold) 45%, transparent)" : undefined,
                zIndex: node.id === hoverId || lit ? 10 : 1 + index,
              }}
            >
              <span
                className={cn(
                  "grid place-items-center rounded-full bg-surface text-sm font-bold",
                  node.complete ? "text-accent-learning" : "text-foreground"
                )}
                style={{ width: size - 8, height: size - 8 }}
              >
                {node.complete ? <Check size={size * 0.4} strokeWidth={3} aria-hidden /> : Array.from(node.title)[0]}
              </span>
              <span className="pointer-events-none absolute top-full mt-1.5 max-w-[9rem] truncate whitespace-nowrap rounded-md bg-surface/90 px-1.5 text-[11px] font-medium text-foreground shadow-sm">
                {node.title}
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* Why they are connected — the map should be checkable, not decorative. */}
      <div className="min-h-12 rounded-2xl bg-fill-subtle px-4 py-3 text-xs text-muted" aria-live="polite">
        {hoverId && hoverEdges.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {hoverEdges.map((edge) => {
              const other = edge.a === hoverId ? edge.b : edge.a;
              return (
                <li key={other}>
                  <span className="font-medium text-foreground">{titleOf(other)}</span> — {edge.reason}
                </li>
              );
            })}
          </ul>
        ) : hoverId ? (
          "לנושא הזה אין קשרים לנושאים אחרים עדיין."
        ) : nodes.length > 1 && edges.length === 0 ? (
          <span className="flex items-center gap-2">
            <Network size={14} aria-hidden />
            עוד אין קשרים בין הנושאים. תן להם קטגוריה משותפת או מושגים דומים, והמפה תתחבר.
          </span>
        ) : (
          "העבר עכבר על נושא כדי לראות עם מה הוא קשור. לחיצה פותחת אותו."
        )}
      </div>
    </section>
  );
}
