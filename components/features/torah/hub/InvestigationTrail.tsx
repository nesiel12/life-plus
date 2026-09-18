"use client";

import Link from "next/link";
import { BookOpen, ChevronLeft, GraduationCap, Route } from "lucide-react";
import { torahHref, useInvestigationTrail, type TrailNode } from "@/lib/torah/trail";
import { cn } from "@/lib/utils";

/**
 * "מסלול החקירה" — the path this sitting took through the Book ⇄ Rabbi loop.
 *
 * Shown only once there is an actual path (two or more stops). Each earlier
 * stop is a link back; the current page is the last, unlinked stop.
 */
export function InvestigationTrail({ current }: { current: Pick<TrailNode, "type" | "id"> }) {
  const trail = useInvestigationTrail();
  if (trail.length < 2) return null;

  return (
    <nav aria-label="מסלול החקירה" className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
      <span className="flex shrink-0 items-center gap-1 text-muted">
        <Route size={13} className="text-gold-ink" aria-hidden />
        מסלול החקירה
      </span>
      <ol className="flex items-center gap-1">
        {trail.map((node, index) => {
          const isCurrent = node.type === current.type && node.id === current.id;
          const Icon = node.type === "book" ? BookOpen : GraduationCap;
          return (
            <li key={`${node.type}:${node.id}`} className="flex shrink-0 items-center gap-1">
              {index > 0 && <ChevronLeft size={12} className="text-muted/60" aria-hidden />}
              {isCurrent ? (
                <span
                  aria-current="page"
                  className="flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 font-medium text-gold-ink"
                >
                  <Icon size={11} aria-hidden />
                  {node.label}
                </span>
              ) : (
                <Link
                  href={torahHref(node)}
                  className={cn(
                    "focus-ring flex items-center gap-1 rounded-full border border-hairline-card px-2.5 py-1 text-muted transition-colors hover:border-gold-line hover:text-foreground"
                  )}
                >
                  <Icon size={11} aria-hidden />
                  {node.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
