"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useInstallState } from "@/lib/pwa/installPrompt";
import { cn } from "@/lib/utils";

const LABEL = "התקן את Life Plus";

function IosInstructions({ id }: { id: string }) {
  return (
    <p id={id} className="text-xs leading-relaxed text-muted">
      ב-iPhone וב-iPad: לחץ על <Share size={12} className="inline align-[-2px]" aria-label="שיתוף" /> שיתוף ← <span className="font-medium text-foreground">הוסף למסך הבית</span>.
    </p>
  );
}

interface InstallPwaButtonProps {
  /** "icon" sits in the sidebar's icon row; "full" is a labelled button with inline iOS instructions. */
  variant?: "icon" | "full";
  className?: string;
}

/**
 * Offers to install the app: the browser's own prompt where it exists
 * (Chrome, Edge, Android), step-by-step instructions on iOS (Safari has no
 * install API), and nothing at all once installed or where neither applies.
 */
export function InstallPwaButton({ variant = "full", className }: InstallPwaButtonProps) {
  const state = useInstallState();
  const [showIos, setShowIos] = useState(false);
  const instructionsId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showIos || variant !== "icon") return;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setShowIos(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [showIos, variant]);

  if (state.kind === "installed" || state.kind === "unavailable") return null;

  const onClick = () => {
    if (state.kind === "prompt") void state.prompt();
    else setShowIos((v) => !v);
  };

  if (variant === "icon") {
    return (
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          type="button"
          onClick={onClick}
          aria-label={LABEL}
          title={LABEL}
          aria-expanded={state.kind === "ios" ? showIos : undefined}
          aria-controls={state.kind === "ios" && showIos ? instructionsId : undefined}
          className="focus-ring nav-liquid-item glass-control-hover grid size-9 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
        >
          <Download size={17} aria-hidden />
        </button>
        {state.kind === "ios" && showIos && (
          <div className="glass-panel absolute bottom-full start-0 z-50 mb-2 w-60 rounded-xl border border-glass-border p-3 shadow-xl">
            <IosInstructions id={instructionsId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-start gap-2", className)}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={state.kind === "ios" ? showIos : undefined}
        aria-controls={state.kind === "ios" && showIos ? instructionsId : undefined}
        className="focus-ring flex min-h-11 items-center gap-2 rounded-xl bg-gold-soft px-4 text-sm font-medium text-gold-ink transition-opacity hover:opacity-85"
      >
        <Download size={15} aria-hidden />
        {LABEL}
      </button>
      {state.kind === "ios" && showIos && <IosInstructions id={instructionsId} />}
    </div>
  );
}

const BANNER_DISMISSED_KEY = "lifeplus.installBanner.dismissed";

/**
 * Phones only: the sidebar (and with it the settings link) is not rendered
 * below `sm`, so without this the install offer — and the iOS instructions,
 * which only matter on phones — would be unreachable there.
 */
export function InstallPwaBanner() {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(BANNER_DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || state.kind === "installed" || state.kind === "unavailable") return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(BANNER_DISMISSED_KEY, "1");
    } catch {
      // dismissed for this session only
    }
  };

  return (
    <div role="region" aria-label={LABEL} className="glass-panel fixed inset-x-3 top-3 z-40 flex items-start gap-3 rounded-2xl border border-glass-border p-3 shadow-xl sm:hidden print:hidden">
      <InstallPwaButton variant="full" className="flex-1" />
      <button type="button" onClick={dismiss} aria-label="סגור" className="focus-ring grid size-8 shrink-0 place-items-center rounded-full text-muted hover:text-foreground">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
