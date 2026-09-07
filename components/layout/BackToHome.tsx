"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The way back to the dashboard from any area page.
 *
 * Until now the only link home was the sidebar logo, which is hidden below
 * `sm` — so on a phone, opening Learning or Torah Space left no way back to
 * Today except the browser's own back button. Every area page renders one of
 * these above its title.
 *
 * ArrowRight, not ArrowLeft: the app is RTL, so "back" points right. Matches
 * the existing back affordance in components/features/torah/EntityHub.tsx.
 */
export function BackToHome({ className, label = "חזרה לדף הבית" }: { className?: string; label?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "focus-ring glass-control-hover inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5",
        "text-xs text-muted transition-colors hover:text-foreground",
        className
      )}
    >
      <ArrowRight size={14} aria-hidden />
      {label}
    </Link>
  );
}
