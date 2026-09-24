import { memo } from "react";
import type { StepVisual as StepVisualData } from "@/types/learning";

/**
 * Dual coding: the brief's one picture. A process is an ordered flow of
 * numbered stages (a real <ol>, so it reads as a sequence to a screen
 * reader too); a comparison is a real <table> with header scopes. Plain
 * HTML/CSS rather than a diagram library — nothing to load, and it reflows
 * to phone width instead of shrinking into an unreadable SVG.
 */
export const StepVisual = memo(function StepVisual({ visual }: { visual: StepVisualData }) {
  if (visual.kind === "process") {
    return (
      <figure className="@container flex flex-col gap-3">
        {visual.title && <figcaption className="text-xs font-semibold text-muted">{visual.title}</figcaption>}
        <ol className="grid gap-2 @lg:grid-flow-col @lg:auto-cols-fr">
          {visual.processStages.map((stage, i) => (
            <li key={i} className="relative flex gap-3 rounded-2xl border border-hairline-card bg-surface p-3 @lg:flex-col @lg:gap-2">
              <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-learning text-xs font-bold text-background">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{stage.title}</p>
                {stage.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{stage.detail}</p>}
              </div>
              {i < visual.processStages.length - 1 && (
                <span aria-hidden className="absolute -bottom-2 start-6 z-10 text-accent-learning @lg:bottom-auto @lg:start-auto @lg:-end-2.5 @lg:top-4">
                  <span className="@lg:hidden">↓</span>
                  <span className="hidden @lg:inline">←</span>
                </span>
              )}
            </li>
          ))}
        </ol>
      </figure>
    );
  }

  if (visual.kind === "comparison") {
    return (
      <div className="overflow-x-auto rounded-2xl border border-hairline-card">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          {visual.title && <caption className="px-3 pt-3 text-start text-xs font-semibold text-muted">{visual.title}</caption>}
          <thead>
            <tr className="border-b border-hairline-card">
              <td className="p-3" />
              {visual.comparisonColumns.map((c) => (
                <th key={c} scope="col" className="p-3 text-start font-semibold text-accent-learning">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visual.comparisonRows.map((row, i) => (
              <tr key={i} className="border-b border-hairline-card last:border-0 odd:bg-fill-subtle/40">
                <th scope="row" className="p-3 text-start font-medium text-foreground">
                  {row.label}
                </th>
                {row.cells.map((cell, j) => (
                  <td key={j} className="p-3 align-top leading-relaxed text-foreground/90">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return null;
});
