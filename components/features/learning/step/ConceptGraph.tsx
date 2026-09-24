"use client";

import { useMemo, useState } from "react";
import { conceptGraphLayout } from "@/lib/learning/stepBrief";
import type { StepConcept } from "@/types/learning";
import { cn } from "@/lib/utils";

const W = 560;
const H = 320;

/**
 * The step's concepts as a small mind map: each concept a node, each
 * `relatedTo` link an edge (only links the model named — normalizeStepBrief
 * already dropped any pointing at a term that doesn't exist). Picking a node
 * highlights its neighbours and shows its definition underneath.
 *
 * Loaded with next/dynamic by StepPreview — it's the one SVG-heavy part of the
 * canvas and not needed for first paint. Nodes are real buttons in the tab
 * order; highlighting is opacity only.
 */
export default function ConceptGraph({ concepts }: { concepts: readonly StepConcept[] }) {
  const { nodes, edges } = useMemo(() => conceptGraphLayout(concepts, W, H), [concepts]);
  const [active, setActive] = useState<string | null>(null);
  const pos = useMemo(() => new Map(nodes.map((n) => [n.term, n])), [nodes]);
  const neighbours = useMemo(() => {
    if (!active) return null;
    const set = new Set([active]);
    for (const e of edges) {
      if (e.from === active) set.add(e.to);
      if (e.to === active) set.add(e.from);
    }
    return set;
  }, [active, edges]);
  const activeConcept = concepts.find((c) => c.term === active);

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-2xl border border-hairline-card bg-fill-subtle/30">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`מפת מושגים: ${concepts.map((c) => c.term).join(", ")}`}>
          {edges.map((e) => {
            const a = pos.get(e.from)!;
            const b = pos.get(e.to)!;
            const lit = !neighbours || (neighbours.has(e.from) && neighbours.has(e.to) && (e.from === active || e.to === active));
            return (
              <line
                key={`${e.from}-${e.to}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                strokeWidth={2}
                className="transition-opacity duration-200"
                style={{ stroke: "var(--accent-learning)", opacity: lit ? 0.55 : 0.08 }}
              />
            );
          })}
        </svg>
        {/* Nodes as HTML buttons over the SVG (positioned in %), so they are
            focusable, wrap Hebrew text properly, and meet the 44px target. */}
        {nodes.map((n) => {
          const dim = neighbours && !neighbours.has(n.term);
          return (
            <button
              key={n.term}
              type="button"
              aria-pressed={active === n.term}
              onClick={() => setActive((cur) => (cur === n.term ? null : n.term))}
              style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
              className={cn(
                "focus-ring absolute min-h-11 max-w-[9rem] -translate-x-1/2 -translate-y-1/2 rounded-2xl border px-3 py-1.5 text-center text-xs font-semibold leading-tight shadow-sm transition-opacity duration-200",
                active === n.term ? "border-accent-learning bg-accent-learning text-background" : "border-hairline-card bg-surface text-foreground hover:border-accent-learning/50",
                dim && "opacity-30"
              )}
            >
              {n.term}
            </button>
          );
        })}
      </div>
      <figcaption aria-live="polite" className="min-h-[2.5rem] text-xs leading-relaxed text-muted">
        {activeConcept ? (
          <>
            <span className="font-semibold text-foreground">{activeConcept.term}:</span> {activeConcept.definition}
          </>
        ) : (
          "בחר/י מושג כדי לראות את ההגדרה ואת המושגים שקשורים אליו."
        )}
      </figcaption>
    </figure>
  );
}
