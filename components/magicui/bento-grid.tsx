// Adapted from MagicUI's Bento Grid (magicui.design) — Option B. Rebuilt for
// the LIFE PLUS token system: no @radix-ui/react-icons, no shadcn <Button>,
// RTL-safe, and BentoCard takes free children (our own cards go inside the
// cells) with an optional name/Icon/cta header for the classic bento look.

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
}

export function BentoGrid({ children, className, ...props }: BentoGridProps) {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-[minmax(11rem,auto)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode;
  /** Ambient visual behind the content (a gradient, LightRays, a chart). */
  background?: ReactNode;
  /** Optional footer link revealed on hover. */
  href?: string;
  cta?: string;
  /** Subtle hover lift. Default on. */
  interactive?: boolean;
}

export function BentoCard({
  children,
  background,
  href,
  cta,
  interactive = true,
  className,
  ...props
}: BentoCardProps) {
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-hairline bg-surface p-6",
        "shadow-[0_1px_2px_rgba(16,16,20,0.04),0_12px_32px_-16px_rgba(16,16,20,0.12)]",
        interactive && "transition-transform duration-300 hover:-translate-y-0.5",
        className
      )}
      {...props}
    >
      {background && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {background}
        </div>
      )}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
      {href && cta && (
        <a
          href={href}
          className="focus-ring relative z-10 mt-4 inline-flex items-center gap-1 self-start rounded-lg text-xs font-medium text-gold-ink opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-visible:opacity-100"
        >
          {cta}
          <ArrowLeft size={12} aria-hidden />
        </a>
      )}
    </div>
  );
}
