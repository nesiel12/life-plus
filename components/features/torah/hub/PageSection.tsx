"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageSectionProps {
  icon: LucideIcon;
  title: string;
  /** One quiet line under the title. */
  subtitle?: string;
  /** Right-aligned header control (a button, a link). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Icon tile tint. */
  tone?: "gold" | "faith" | "learning" | "knowledge" | "family";
  delay?: number;
}

const TONES: Record<NonNullable<PageSectionProps["tone"]>, string> = {
  gold: "bg-gold-soft text-gold-ink",
  faith: "bg-accent-faith/12 text-accent-faith",
  learning: "bg-accent-learning/12 text-accent-learning",
  knowledge: "bg-accent-knowledge/12 text-accent-knowledge",
  family: "bg-accent-family/12 text-accent-family",
};

/**
 * One titled section of a Book or Rabbi page.
 *
 * A <section> with a real heading rather than a styled div, so the page has
 * an outline a screen reader can navigate section by section — these pages
 * are long, and "jump to the bookshelf" should be one keystroke.
 */
export function PageSection({
  icon: Icon,
  title,
  subtitle,
  action,
  children,
  className,
  id,
  tone = "gold",
  delay = 0,
}: PageSectionProps) {
  const reduceMotion = useReducedMotion();
  const headingId = id ? `${id}-heading` : undefined;

  return (
    <motion.section
      id={id}
      aria-labelledby={headingId}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={cn("glass-card scroll-mt-24 rounded-2xl p-5 sm:p-6", className)}
    >
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", TONES[tone])} aria-hidden>
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-[0.95rem] font-medium text-foreground">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </motion.section>
  );
}

/** The standard empty/placeholder block inside a section — designed, not blank. */
export function SectionPlaceholder({
  icon: Icon,
  title,
  body,
  children,
}: {
  icon: LucideIcon;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-hairline-card bg-surface-sunken/50 px-4 py-6 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-fill-subtle text-muted" aria-hidden>
        <Icon size={18} />
      </span>
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {body && <p className="max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {children && <div className="mt-1 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** A compact pill link/button used across both pages' action rows. */
export function ActionPill({
  icon: Icon,
  children,
  href,
  onClick,
  disabled,
  busy,
  variant = "quiet",
}: {
  icon: LucideIcon;
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "quiet" | "gold";
}) {
  const className = cn(
    "focus-ring inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
    variant === "gold"
      ? "bg-gold text-white hover:brightness-105"
      : "border border-hairline-card bg-surface text-foreground/85 hover:border-gold-line hover:text-foreground"
  );
  const content = (
    <>
      <Icon size={13} className={busy ? "animate-spin" : undefined} aria-hidden />
      {children}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy} className={className}>
      {content}
    </button>
  );
}
