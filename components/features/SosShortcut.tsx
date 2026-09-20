"use client";

import { LifeBuoy } from "lucide-react";
import { triggerCompanionSos } from "@/lib/intelligence/crossModule/sosTrigger";
import { cn } from "@/lib/utils";

/**
 * "קשה לי עכשיו", for surfaces outside the Companion — starting with the
 * recovery lock screen, where someone in distress should not have to
 * authenticate before getting a calming screen.
 *
 * It opens the Companion's SOS mode and nothing else: no request, no write,
 * no log (lib/intelligence/crossModule/sosTrigger.ts). The words are generic on
 * purpose — they say nothing about *what* is hard, so they are safe to show on
 * a screen whose whole point is that a glance reveals nothing.
 */
export function SosShortcut({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={triggerCompanionSos}
      className={cn(
        "focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-foreground",
        className
      )}
    >
      <LifeBuoy size={13} aria-hidden />
      קשה לי עכשיו
    </button>
  );
}
