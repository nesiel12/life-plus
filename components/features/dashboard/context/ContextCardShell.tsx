"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ContextCardShellProps {
  icon: LucideIcon;
  title: string;
  /** Tailwind text color for the icon, from the accent tokens. */
  iconClass?: string;
  href?: string;
  cta?: string;
  children: ReactNode;
  className?: string;
}

// The compact surface every context-band card shares. Smaller and flatter than
// a bento cell on purpose: the band sits above the user's own grid and should
// read as "what suits right now", not as four more full-size widgets.
export function ContextCardShell({ icon: Icon, title, iconClass, href, cta, children, className }: ContextCardShellProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-2xl border border-hairline-card bg-surface/80 p-4",
        "shadow-[0_1px_2px_rgba(16,16,20,0.03)]",
        className
      )}
    >
      {/* Wraps rather than truncates: a card narrow enough to squeeze the
          title against its link puts the link on its own line instead. */}
      <header className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
        <h3 className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted">
          <Icon size={15} className={cn("shrink-0", iconClass)} aria-hidden />
          <span>{title}</span>
        </h3>
        {href && (
          <Link
            href={href}
            className="focus-ring flex shrink-0 items-center gap-1 rounded text-xs text-gold-ink hover:opacity-80"
          >
            {cta}
            <ArrowLeft size={11} aria-hidden />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}
