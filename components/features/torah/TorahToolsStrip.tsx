"use client";

import Link from "next/link";
import { ChevronLeft, Network, NotebookPen, Printer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const TOOLS: { href: string; icon: LucideIcon; title: string; body: string; tone: string }[] = [
  {
    href: "/areas/torah/map",
    icon: Network,
    title: "מפת הקשרים",
    body: "ספרים, רבנים, שיעורים ומושגים — וכל מה שמחבר ביניהם, במפה אחת.",
    tone: "bg-accent-knowledge/12 text-accent-knowledge",
  },
  {
    href: "/areas/torah/notes",
    icon: NotebookPen,
    title: "הסיכומים שלי",
    body: "כל מה שכתבת, סרקת מכתב יד או הקלטת — במקום אחד.",
    tone: "bg-accent-knowledge/12 text-accent-knowledge",
  },
  {
    href: "/areas/torah/shabbat-print",
    icon: Printer,
    title: "הדפסה לשבת",
    body: "גיליון מעוצב עם הלימוד של השבוע — סיכומים, תובנות, שאלות וכרטיסיות.",
    tone: "bg-gold-soft text-gold-ink",
  },
];

/** The two full-screen tools of מרחב תורה, at the top of the hub. */
export function TorahToolsStrip({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {TOOLS.map(({ href, icon: Icon, title, body, tone }) => (
        <Link
          key={href}
          href={href}
          className="focus-ring glass-card group flex items-center gap-3.5 rounded-2xl p-4 transition-colors hover:border-gold-line"
        >
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", tone)} aria-hidden>
            <Icon size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            <span className="block text-xs leading-relaxed text-muted">{body}</span>
          </span>
          <ChevronLeft size={16} className="shrink-0 text-muted transition-transform group-hover:-translate-x-0.5" aria-hidden />
        </Link>
      ))}
    </div>
  );
}
