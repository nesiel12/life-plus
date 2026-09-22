"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

function Block({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cn("animate-pulse rounded-2xl bg-gradient-to-l from-fill-subtle via-fill-subtle/60 to-fill-subtle bg-[length:200%_100%]", className)} style={style} />;
}

/**
 * The Masterclass & Gaming OS's loading state — mirrors LessonViewport.tsx's
 * own section layout exactly (origin story banner, pioneer cards, core
 * content, checkpoints) so nothing visibly jumps or resizes the moment real
 * content replaces it, just RTL-aware pulsing placeholders in its place.
 */
export function LessonViewportSkeleton() {
  return (
    <div dir="rtl" className="flex flex-col gap-6" aria-busy="true" aria-label="טוען שיעור…">
      {/* Origin story banner */}
      <div className="flex flex-col gap-3 rounded-3xl border border-hairline-card bg-surface p-6">
        <Block className="h-4 w-24" />
        <Block className="h-7 w-2/3" />
        <Block className="h-4 w-full" />
        <Block className="h-4 w-5/6" />
        <Block className="h-4 w-3/4" />
      </div>

      {/* Pioneer cards */}
      <div>
        <Block className="mb-3 h-5 w-32" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-2 rounded-2xl border border-hairline-card bg-surface p-4">
              <Block className="size-16 rounded-full" />
              <Block className="h-4 w-3/4" />
              <Block className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>

      {/* Core content */}
      <div className="flex flex-col gap-2 rounded-3xl border border-hairline-card bg-surface p-6">
        <Block className="mb-2 h-5 w-40" />
        {[100, 95, 90, 80, 60].map((w, i) => (
          <Block key={i} className="h-4" style={{ width: `${w}%` }} />
        ))}
      </div>

      {/* Checkpoints */}
      <div className="flex flex-col gap-3">
        <Block className="h-5 w-28" />
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl border border-hairline-card bg-surface p-4">
            <Block className="h-4 w-3/4" />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((j) => (
                <Block key={j} className="h-9" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
